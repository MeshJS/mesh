import { Protocol, UTxO } from "@meshsdk/common";
import { Crypto, deserializeTx } from "@meshsdk/core-cst";

import { slotToUnixMs } from "../chain";
import {
  MASUMI_MIN_COLLATERAL_LOVELACE,
  masumiMinUtxoLovelace,
} from "../masumi/constants";
import {
  addressCredentials,
  MasumiAddressCredentials,
  MasumiCredential,
  parseMasumiLockDatum,
} from "../masumi/datum";
import {
  isMasumiDeploymentAllowed,
  masumiEscrowAddress,
  resolveMasumiDeployment,
} from "../masumi/escrow-address";
import {
  checkRegistryClaim,
  isLovelacePayment,
  validateMasumiRequirementsFull,
} from "../masumi/validate";
import { toMeshUnit } from "../types/asset";
import { PaymentPayload } from "../types/payment-payload";
import { PaymentRequirementsExtraMasumi } from "../types/payment-requirements";
import { invalid, VerifyOptions, VerifyResult } from "./verify";

const credEqual = (
  a: MasumiCredential | undefined,
  b: MasumiCredential | undefined,
): boolean =>
  a === undefined || b === undefined
    ? a === b
    : a.isScript === b.isScript && a.hash === b.hash;

const addressEqual = (
  a: MasumiAddressCredentials,
  b: MasumiAddressCredentials,
): boolean => credEqual(a.payment, b.payment) && credEqual(a.stake, b.stake);

/**
 * Whether the tx carries a valid vkey witness (a real Ed25519 signature over the tx body hash)
 * by the key whose hash is `keyHash`.
 */
const hasValidWitnessFor = (
  tx: ReturnType<typeof deserializeTx>,
  keyHash: string,
): boolean => {
  const vkeys = tx.witnessSet().vkeys();
  if (!vkeys) return false;
  const bodyHash = tx.getId();
  return vkeys.values().some((witness) => {
    const publicKey = Crypto.Ed25519PublicKey.fromHex(
      witness.vkey() as Crypto.Ed25519PublicKeyHex,
    );
    return (
      publicKey.hash().hex() === keyHash &&
      publicKey.verify(
        Crypto.Ed25519Signature.fromHex(
          witness.signature() as Crypto.Ed25519SignatureHex,
        ),
        bodyHash as never,
      )
    );
  });
};

/**
 * Runs the full Masumi checklist against a payload whose core rules already passed.
 * Composed of independently-reasoned sub-checks so a failure always names the specific rule
 * that broke, rather than a generic "invalid masumi payment". `inputs` are the authenticated
 * UTxOs the transaction consumes (resolved once by the core checks).
 */
export const verifyMasumiPayment = async (
  payload: PaymentPayload,
  tx: ReturnType<typeof deserializeTx>,
  inputs: Map<string, UTxO>,
  protocol: Protocol,
  _currentSlot: number,
  options: VerifyOptions = {},
): Promise<VerifyResult> => {
  const requirements = payload.accepted;
  const extra = requirements.extra as PaymentRequirementsExtraMasumi;

  // Schema (closed objects), commitment digests, seller COSE authorization over `termsDigest`,
  // independently derived escrow address == payTo, compatibility identifier, deadline intervals.
  const failure = await validateMasumiRequirementsFull(requirements);
  if (failure) return invalid(failure.code);
  const terms = extra.terms!;

  // A non-default deployment is a different trust domain (its admins arbitrate disputes), and
  // the seller's signature is not approval - the application must opt in.
  const deployment = resolveMasumiDeployment(
    requirements.network,
    extra.deployment,
  )!;
  if (
    !(await isMasumiDeploymentAllowed(
      requirements.network,
      deployment,
      options.allowMasumiDeployment,
    ))
  ) {
    return invalid("MASUMI_DEPLOYMENT_NOT_ALLOWED");
  }
  const escrowAddress = masumiEscrowAddress(requirements.network, deployment);

  // A non-empty agentIdentifier is a registry claim; the prefix check is not enough on its own.
  const registry = await checkRegistryClaim(
    requirements,
    payload.resource,
    options.validateRegistryClaim,
  );
  if (registry) return invalid(registry.code);

  // The lock's validity upper bound must fall on/before `pay_by_time` (slot -> wall-clock via
  // the network's slot configuration, not an assumed 1 slot/s).
  const ttl = tx.body().ttl();
  if (ttl === undefined) return invalid("MASUMI_TTL_AFTER_PAY_BY_TIME");
  if (
    slotToUnixMs(requirements.network, Number(ttl)) > Number(terms.payByTime)
  ) {
    return invalid("MASUMI_TTL_AFTER_PAY_BY_TIME");
  }

  // Exactly one escrow output at payTo, with an inline datum and no reference script.
  const outputs = tx.body().outputs();
  let escrowOutputIndex = -1;
  for (let i = 0; i < outputs.length; i++) {
    if (outputs.at(i)!.address().toBech32().toString() === escrowAddress) {
      if (escrowOutputIndex !== -1)
        return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
      escrowOutputIndex = i;
    }
  }
  if (escrowOutputIndex === -1) return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  const escrowOutput = outputs.at(escrowOutputIndex)!;

  const datumCbor = escrowOutput.datum()?.asInlineData()?.toCbor().toString();
  if (!datumCbor) return invalid("MASUMI_INVALID_OUTPUT_SHAPE"); // must be inline, not a datum hash
  if (escrowOutput.scriptRef()) return invalid("MASUMI_INVALID_OUTPUT_SHAPE"); // no reference script

  const view = parseMasumiLockDatum(datumCbor);
  if (!view) return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  if (view.state !== 0) return invalid("MASUMI_INVALID_OUTPUT_SHAPE"); // must be FundsLocked
  if (view.resultHash !== "") return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  if (view.sellerCooldownTime !== 0n || view.buyerCooldownTime !== 0n) {
    return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  }
  if (view.referenceSignature.length / 2 < 16)
    return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  if (
    view.referenceKey !== extra.referenceKey ||
    view.referenceSignature !== extra.referenceSignature ||
    view.sellerNonce !== terms.sellerNonce ||
    view.buyerNonce !== terms.buyerNonce ||
    view.agentIdentifier !== (terms.agentIdentifier ?? "") ||
    view.inputHash !== terms.inputHash ||
    view.payByTime !== BigInt(terms.payByTime) ||
    view.submitResultTime !== BigInt(terms.submitResultTime) ||
    view.unlockTime !== BigInt(terms.unlockTime) ||
    view.externalDisputeUnlockTime !== BigInt(terms.externalDisputeUnlockTime)
  ) {
    return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  }

  // seller == terms.sellerAddress (payment AND stake part); seller_return_address matches the
  // signed terms exactly (declared => present with matching credentials; omitted => None).
  const sellerCreds = addressCredentials(terms.sellerAddress);
  if (!addressEqual(view.seller, sellerCreds))
    return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  if (terms.sellerReturnAddress === undefined) {
    if (view.sellerReturnAddress !== null)
      return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  } else if (
    view.sellerReturnAddress === null ||
    !addressEqual(
      view.sellerReturnAddress,
      addressCredentials(terms.sellerReturnAddress),
    )
  ) {
    return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  }

  // buyer, seller and both return addresses are verification-key addresses - which also means
  // none of them can be the (script) escrow address itself. `buyer_return_address` is
  // buyer-chosen and deliberately not matched against `extra`.
  const datumAddresses = [
    view.buyer,
    view.seller,
    view.buyerReturnAddress,
    view.sellerReturnAddress,
  ];
  if (
    datumAddresses.some((a) => a && (a.payment.isScript || a.stake?.isScript))
  ) {
    return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  }
  // No aggregated payouts: effective buyer target (return address, else buyer) differs from the seller's.
  const effectiveBuyer = view.buyerReturnAddress ?? view.buyer;
  const effectiveSeller = view.sellerReturnAddress ?? view.seller;
  if (addressEqual(effectiveBuyer, effectiveSeller))
    return invalid("MASUMI_INVALID_OUTPUT_SHAPE");

  // The payment credential in `buyer` controls the input named by `payload.nonce`, and the tx
  // carries that credential's valid witness.
  const nonceUtxo = inputs.get(payload.payload.nonce);
  if (!nonceUtxo) return invalid("MASUMI_NONCE_NOT_BUYER_CREDENTIAL");
  const nonceOwner = addressCredentials(nonceUtxo.output.address);
  if (
    nonceOwner.payment.isScript ||
    !credEqual(nonceOwner.payment, view.buyer.payment)
  ) {
    return invalid("MASUMI_NONCE_NOT_BUYER_CREDENTIAL");
  }
  if (!hasValidWitnessFor(tx, view.buyer.payment.hash))
    return invalid("MASUMI_BUYER_WITNESS_MISSING");

  // lockedLovelace = requestedLovelace + collateral_return_lovelace.
  const isLovelace = isLovelacePayment(requirements);
  const requestedLovelace = isLovelace ? BigInt(requirements.amount) : 0n;
  const lockedLovelace = escrowOutput.amount().coin();
  if (lockedLovelace !== requestedLovelace + view.collateralReturnLovelace) {
    return invalid("MASUMI_INVALID_LOCKED_LOVELACE");
  }

  // collateral_return_lovelace is 0, or >= the protocol floor ...
  if (
    view.collateralReturnLovelace !== 0n &&
    view.collateralReturnLovelace < MASUMI_MIN_COLLATERAL_LOVELACE
  ) {
    return invalid("MASUMI_INVALID_COLLATERAL_RETURN");
  }
  // ... and the locked lovelace must clear the min-UTXO of the datum AFTER `SubmitResult`
  // (32-byte result_hash + non-zero cooldowns), or the seller can never spend the escrow.
  const nativeTokenCount = isLovelace ? 0 : 1;
  if (
    lockedLovelace <
    masumiMinUtxoLovelace(
      datumCbor.length / 2,
      nativeTokenCount,
      BigInt(protocol.coinsPerUtxoSize),
    )
  ) {
    return invalid("MASUMI_INVALID_COLLATERAL_RETURN");
  }

  // The escrow output carries EXACTLY the requested asset set: nothing but lovelace for a
  // lovelace payment; for a native-token payment exactly that one asset, in exactly `amount`.
  const multiasset = escrowOutput.amount().multiasset() as unknown as
    Map<string, bigint> | undefined;
  const held = multiasset ? Array.from(multiasset) : [];
  if (isLovelace) {
    if (held.length !== 0) return invalid("MASUMI_ASSET_SET_MISMATCH");
  } else {
    const [entry] = held;
    if (
      held.length !== 1 ||
      entry![0] !== toMeshUnit(requirements.asset) ||
      entry![1] !== BigInt(requirements.amount)
    ) {
      return invalid("MASUMI_ASSET_SET_MISMATCH");
    }
  }

  return { isValid: true };
};
