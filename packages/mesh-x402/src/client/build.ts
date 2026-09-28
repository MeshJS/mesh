import { MeshTxBuilder } from "@meshsdk/transaction";
import { MeshWallet } from "@meshsdk/wallet";
import { IFetcher, Protocol } from "@meshsdk/common";
import { deserializeTx } from "@meshsdk/core-cst";

import { toMeshUnit } from "../types/asset";
import {
  getAssetTransferMethod,
  PaymentRequirements,
  PaymentRequirementsExtraScript,
  ResourceInfo,
} from "../types/payment-requirements";
import { PaymentPayload } from "../types/payment-payload";
import { X402Error } from "../types/errors";
import { buildMasumiEscrowPayment } from "./masumi";
import { buildScriptOutputDatum, resolveScriptAddress } from "../script";

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
};

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
    .invalidHereafter(currentSlot + requirement.maxTimeoutSeconds);
  return txBuilder.complete();
};

const buildScriptPayment = async (
  requirement: PaymentRequirements,
  buyerAddress: string,
  utxos: Awaited<ReturnType<MeshWallet["getUtxos"]>>,
  { fetcher, currentSlot }: ChainContext,
): Promise<string> => {
  const extra = requirement.extra as PaymentRequirementsExtraScript;
  const scriptAddress = resolveScriptAddress(extra, requirement.network);
  if (scriptAddress !== requirement.payTo) {
    throw new X402Error(
      "SCRIPT_ADDRESS_MISMATCH",
      `Derived script address ${scriptAddress} does not match payTo ${requirement.payTo}`,
    );
  }

  const unit = toMeshUnit(requirement.asset);
  const datum = buildScriptOutputDatum(extra);
  if (!datum) {
    throw new X402Error("SCRIPT_DATUM_NOT_INLINE", "script-method PaymentRequirements is missing `extra.datum`");
  }

  const txBuilder = new MeshTxBuilder({ fetcher, verbose: false });
  txBuilder
    .txOut(requirement.payTo, [{ unit, quantity: requirement.amount }])
    .txOutInlineDatumValue(datum, "CBOR")
    .changeAddress(buyerAddress)
    .selectUtxosFrom(utxos)
    .invalidHereafter(currentSlot + requirement.maxTimeoutSeconds);
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
  const utxos = await wallet.getUtxos();
  const buyerAddress = await wallet.getChangeAddress();

  const method = getAssetTransferMethod(requirement);
  const unsignedTx =
    method === "masumi"
      ? await buildMasumiEscrowPayment(requirement, buyerAddress, utxos, chain.protocol, chain.currentSlot, chain.fetcher)
      : method === "script"
        ? await buildScriptPayment(requirement, buyerAddress, utxos, chain)
        : await buildDefaultPayment(requirement, buyerAddress, utxos, chain);

  const tx = deserializeTx(unsignedTx);
  const firstInput = tx.body().inputs().values()[0];
  if (!firstInput) {
    throw new X402Error("INSUFFICIENT_UTXOS", "Built transaction has no inputs to use as the payload nonce");
  }
  const nonce = `${firstInput.transactionId().toString()}#${firstInput.index()}`;

  return {
    x402Version: 2,
    resource,
    accepted: requirement,
    // `transaction` is hex here (unsigned) so a caller can inspect it before signing;
    // `signPayment` both signs it and converts to the spec's base64 representation.
    payload: { transaction: unsignedTx, nonce },
  };
};
