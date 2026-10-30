import { IFetcher, Protocol } from "@meshsdk/common";
import { deserializeBech32Address, deserializeTx } from "@meshsdk/core-cst";
import { MeshTxBuilder } from "@meshsdk/transaction";
import { MeshWallet } from "@meshsdk/wallet";

import { AllowMasumiDeployment } from "../masumi/escrow-address";
import { MasumiRegistryValidator } from "../masumi/validate";
import {
  buildScriptOutputDatum,
  scriptPayToMatches,
  scriptV1WithInlineDatum,
} from "../script";
import { parsePositiveAmount, toMeshUnit } from "../types/asset";
import { X402Error } from "../types/errors";
import { tryNormalizeCardanoNetwork } from "../types/network";
import { PaymentPayload } from "../types/payment-payload";
import {
  getAssetTransferMethod,
  PaymentRequirements,
  PaymentRequirementsExtraScript,
  ResourceInfo,
} from "../types/payment-requirements";
import { buildMasumiEscrowPayment } from "./masumi";
import { paymentTtlSlot } from "./ttl";

/**
 * Chain context a caller must supply to build a payment: the current tip's slot (for TTL)
 * and the live protocol parameters (for min-UTXO/fee-aware balancing). Neither is exposed by
 * Mesh's `IFetcher` interface in a provider-agnostic way, so callers resolve them from
 * whatever provider they use (e.g. a Blockfrost "latest block"/"epoch parameters" call).
 */
export type ChainContext = {
  fetcher: IFetcher;
  protocol: Protocol;
  currentSlot: number;
  /**
   * Explicit approval of a non-default Masumi deployment. The spec requires the *application*
   * to allow a non-default parameter set (the seller's signature is not approval); without
   * this hook only the canonical deployment is paid into. Present the effective admin weights
   * (`masumiAdminWeights`) to the user before approving.
   */
  allowMasumiDeployment?: AllowMasumiDeployment;
  /** Independently validates a non-empty Masumi `agentIdentifier` before the client pays. Default: such offers are refused. */
  validateRegistryClaim?: MasumiRegistryValidator;
};

export { paymentTtlSlot } from "./ttl";

const buildDefaultPayment = async (
  requirement: PaymentRequirements,
  buyerAddress: string,
  utxos: Awaited<ReturnType<MeshWallet["getUtxos"]>>,
  { fetcher, currentSlot }: ChainContext,
): Promise<string> => {
  const unit = toMeshUnit(requirement.asset);
  const txBuilder = new MeshTxBuilder({ fetcher, verbose: false });
  txBuilder
    .txOut(requirement.payTo, [{ unit, quantity: requirement.amount }])
    .changeAddress(buyerAddress)
    .selectUtxosFrom(utxos)
    .invalidHereafter(paymentTtlSlot(requirement, currentSlot));
  return txBuilder.complete();
};

const buildScriptPayment = async (
  requirement: PaymentRequirements,
  buyerAddress: string,
  utxos: Awaited<ReturnType<MeshWallet["getUtxos"]>>,
  { fetcher, currentSlot }: ChainContext,
): Promise<string> => {
  const extra = requirement.extra as PaymentRequirementsExtraScript;
  if (!extra.script && !extra.scriptHash) {
    throw new X402Error(
      "SCRIPT_INVALID",
      "script-method PaymentRequirements must declare `script` or `scriptHash`",
    );
  }
  if (scriptV1WithInlineDatum(extra)) {
    throw new X402Error(
      "SCRIPT_V1_WITH_DATUM",
      "a Plutus V1 script cannot spend an output carrying an inline datum - refusing to strand the funds",
    );
  }
  // `payTo`'s script credential must be the declared script's hash (a stake part is allowed).
  if (!scriptPayToMatches(extra, requirement.payTo)) {
    throw new X402Error(
      "SCRIPT_ADDRESS_MISMATCH",
      `payTo ${requirement.payTo} is not the address of the declared script`,
    );
  }

  const unit = toMeshUnit(requirement.asset);
  // The datum is optional: some scripts spend without one. When declared it is attached verbatim, inline.
  const datum = buildScriptOutputDatum(extra);

  const txBuilder = new MeshTxBuilder({ fetcher, verbose: false });
  txBuilder.txOut(requirement.payTo, [{ unit, quantity: requirement.amount }]);
  if (datum) txBuilder.txOutInlineDatumValue(datum, "CBOR");
  txBuilder
    .changeAddress(buyerAddress)
    .selectUtxosFrom(utxos)
    .invalidHereafter(paymentTtlSlot(requirement, currentSlot));
  return txBuilder.complete();
};

/**
 * Builds an unsigned x402 `PaymentPayload` for a chosen `PaymentRequirements` entry: fetches
 * the wallet's UTxOs/change address, builds the appropriate transaction for the requirement's
 * `assetTransferMethod`, and re-derives `nonce` from the tx's actually-consumed input.
 */
export const buildPaymentPayload = async (
  requirement: PaymentRequirements,
  wallet: MeshWallet,
  resource: ResourceInfo,
  chain: ChainContext,
): Promise<PaymentPayload> => {
  if (
    requirement.scheme !== "exact" ||
    !tryNormalizeCardanoNetwork(requirement.network)
  ) {
    throw new X402Error(
      "NO_ACCEPTABLE_REQUIREMENT",
      `unsupported scheme/network: ${requirement.scheme} on ${requirement.network}`,
    );
  }
  if (parsePositiveAmount(requirement.amount) === null) {
    throw new X402Error(
      "INVALID_AMOUNT",
      `amount must be a positive canonical decimal string, got "${requirement.amount}"`,
    );
  }
  requirement = {
    ...requirement,
    network: tryNormalizeCardanoNetwork(requirement.network)!,
  };

  const utxos = await wallet.getUtxos();
  const buyerAddress = await wallet.getChangeAddress();

  const method = getAssetTransferMethod(requirement);
  const unsignedTx =
    method === "masumi"
      ? await buildMasumiEscrowPayment(
          requirement,
          buyerAddress,
          utxos,
          chain.protocol,
          chain.currentSlot,
          chain.fetcher,
          chain.allowMasumiDeployment,
          { resource, validate: chain.validateRegistryClaim },
        )
      : method === "script"
        ? await buildScriptPayment(requirement, buyerAddress, utxos, chain)
        : await buildDefaultPayment(requirement, buyerAddress, utxos, chain);

  const tx = deserializeTx(unsignedTx);
  const inputs = tx.body().inputs().values();
  // Prefer an input the buyer's own payment credential controls (a Masumi lock names that
  // credential as `buyer` and must prove it controls the nonce input); fall back to the first.
  const buyerPaymentHash = (() => {
    try {
      return deserializeBech32Address(buyerAddress).pubKeyHash;
    } catch {
      return undefined;
    }
  })();
  const ownsInput = (input: (typeof inputs)[number]): boolean =>
    utxos.some((u) => {
      if (
        u.input.txHash !== input.transactionId().toString() ||
        u.input.outputIndex !== Number(input.index())
      )
        return false;
      try {
        return (
          deserializeBech32Address(u.output.address).pubKeyHash ===
          buyerPaymentHash
        );
      } catch {
        return false;
      }
    });
  const nonceInput = inputs.find(ownsInput) ?? inputs[0];
  if (!nonceInput) {
    throw new X402Error(
      "INSUFFICIENT_UTXOS",
      "Built transaction has no inputs to use as the payload nonce",
    );
  }
  const nonce = `${nonceInput.transactionId().toString()}#${nonceInput.index()}`;

  return {
    x402Version: 2,
    resource,
    accepted: requirement,
    // `transaction` is hex here (unsigned) so a caller can inspect it before signing;
    // `signPayment` both signs it and converts to the spec's base64 representation.
    payload: { transaction: unsignedTx, nonce },
  };
};
