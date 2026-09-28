/**
 * Buyer-side Masumi escrow lock construction: the inline datum plus the lovelace the
 * escrow output must carry. Ported from `x402-foundation/x402`'s reference implementation
 * (`typescript/packages/mechanisms/cardano/src/exact/masumi/lock.ts`, Apache-2.0).
 *
 * Everything in the datum besides the buyer's own address/return-address comes from the
 * seller-signed `terms` - including `buyer_nonce` and `input_hash`, which the seller signs,
 * so the client must not invent them.
 */
import { Data } from "@meshsdk/common";
import { fromBuilderToPlutusData } from "@meshsdk/core-cst";

import { LOVELACE } from "../types/asset";
import { PaymentRequirementsExtraMasumi } from "../types/payment-requirements";
import { buildMasumiLockDatum } from "./datum";
import { masumiCollateralLovelace } from "./constants";

/** Buyer-side inputs to the lock, never declared by the server. */
export type MasumiBuyerInput = {
  /** datum `buyer_return_address`. MUST differ from the effective seller payout target. */
  buyerReturnAddress?: string;
};

export type MasumiLock = {
  /** The inline datum to attach to the `payTo` output. */
  datum: Data;
  /** datum `collateral_return_lovelace`. */
  collateralLovelace: bigint;
  /** Lovelace the escrow output must carry: `requestedLovelace + collateralLovelace`. */
  lockedLovelace: bigint;
};

/**
 * The collateral is a datum field, so growing it grows the datum, which raises the
 * post-`SubmitResult` min-UTXO it has to clear. Re-deriving it a few times reaches the
 * fixed point; four rounds is far more than the one or two byte-length changes a realistic
 * integer encoding produces.
 */
const COLLATERAL_FIXED_POINT_ROUNDS = 4;

/**
 * Builds the Masumi `vested_pay` lock: the 19-field inline datum and the lovelace the
 * escrow output must carry.
 *
 * The seller never supplies or signs `collateral_return_lovelace` - the client computes it
 * from the requested asset and live protocol parameters so that
 * `lockedLovelace = requestedLovelace + collateral` still clears the min-UTXO of the datum
 * after `SubmitResult`. Otherwise the seller could never spend the escrow.
 */
export const buildMasumiLock = (
  extra: PaymentRequirementsExtraMasumi,
  buyerAddress: string,
  asset: string,
  amount: bigint,
  coinsPerUtxoByte: bigint,
  buyerInput: MasumiBuyerInput = {},
): MasumiLock => {
  const { terms } = extra;
  if (!terms) throw new Error("Masumi payment requirements are missing `extra.terms`");
  if (!extra.referenceKey || !extra.referenceSignature) {
    throw new Error("Masumi payment requirements are missing `extra.referenceKey`/`referenceSignature`");
  }

  const isLovelace = asset.toLowerCase() === LOVELACE;
  const requestedLovelace = isLovelace ? amount : 0n;
  const nativeTokenCount = isLovelace ? 0 : 1;

  const build = (collateral: bigint): Data =>
    buildMasumiLockDatum({
      buyerAddress,
      sellerAddress: terms.sellerAddress,
      buyerReturnAddress: buyerInput.buyerReturnAddress,
      sellerReturnAddress: terms.sellerReturnAddress,
      referenceKey: extra.referenceKey!,
      referenceSignature: extra.referenceSignature!,
      sellerNonce: terms.sellerNonce,
      buyerNonce: terms.buyerNonce,
      agentIdentifier: terms.agentIdentifier ?? "",
      collateralReturnLovelace: collateral,
      inputHash: terms.inputHash,
      payByTime: BigInt(terms.payByTime),
      submitResultTime: BigInt(terms.submitResultTime),
      unlockTime: BigInt(terms.unlockTime),
      externalDisputeUnlockTime: BigInt(terms.externalDisputeUnlockTime),
    });

  let collateral = 0n;
  let datum = build(collateral);
  let converged = false;
  for (let round = 0; round < COLLATERAL_FIXED_POINT_ROUNDS; round++) {
    const datumCbor = fromBuilderToPlutusData({ type: "Mesh", content: datum }).toCbor();
    const datumBytes = datumCbor.length / 2;
    const needed = masumiCollateralLovelace(requestedLovelace, datumBytes, nativeTokenCount, coinsPerUtxoByte);
    if (needed <= collateral) {
      converged = true;
      break;
    }
    collateral = needed;
    datum = build(collateral);
  }
  if (!converged) {
    throw new Error("Masumi collateral did not converge; refusing to build an unspendable lock");
  }

  return {
    datum,
    collateralLovelace: collateral,
    lockedLovelace: requestedLovelace + collateral,
  };
};
