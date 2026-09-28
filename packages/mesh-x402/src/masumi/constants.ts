/**
 * Masumi escrow constants and pure validation/min-UTXO helpers.
 *
 * Ported from `x402-foundation/x402`'s reference implementation
 * (`typescript/packages/mechanisms/cardano/src/exact/masumi/constants.ts`, Apache-2.0) so the
 * two implementations agree byte-for-byte on deadline gaps and collateral math - this is the
 * single copy of these rules and must not drift between issuer, client and facilitator.
 */

/** `PaymentSourceType` this scheme targets - the `vested_pay` payment-v2 escrow. */
export const MASUMI_PAYMENT_SOURCE_TYPE = "Web3CardanoV2";

/** Non-zero `collateral_return_lovelace` floor (Masumi's `CONSTANTS.MIN_COLLATERAL_LOVELACE`). */
export const MASUMI_MIN_COLLATERAL_LOVELACE = 1_435_230n;

/** Minimum gap from `pay_by_time` to `submit_result_time`. */
export const MASUMI_MIN_PAY_TO_SUBMIT_MS = 5n * 60n * 1000n;
/** Minimum gap from `submit_result_time` to `unlock_time`. */
export const MASUMI_MIN_SUBMIT_TO_UNLOCK_MS = 15n * 60n * 1000n;
/** Minimum gap from `unlock_time` to `external_dispute_unlock_time`. */
export const MASUMI_MIN_UNLOCK_TO_DISPUTE_MS = 15n * 60n * 1000n;

/**
 * Whether the four escrow deadlines are ordered and clear the minimum gaps. The issuer
 * applies it to what it is about to sign, the client to the seller-signed `terms`, and the
 * facilitator to the integers actually in the datum - they must not drift.
 */
export const masumiDeadlineIntervalsHold = (
  payByTime: bigint,
  submitResultTime: bigint,
  unlockTime: bigint,
  externalDisputeUnlockTime: bigint,
): boolean =>
  payByTime + MASUMI_MIN_PAY_TO_SUBMIT_MS <= submitResultTime &&
  submitResultTime + MASUMI_MIN_SUBMIT_TO_UNLOCK_MS <= unlockTime &&
  unlockTime + MASUMI_MIN_UNLOCK_TO_DISPUTE_MS <= externalDisputeUnlockTime;

// Min-UTXO for the escrow output must cover the datum as it will look AFTER the seller
// submits a result, not at lock time: `result_hash` grows from empty to 32 bytes and the
// cooldowns from 0 to real POSIX-ms timestamps. Otherwise the seller's SubmitResult output
// falls below min-UTXO and cannot be built. Mirrors Masumi's `calculateMinUtxo`.
const MASUMI_RESULT_HASH_DELTA_BYTES = 33;
const MASUMI_MINUTXO_OVERHEAD_BYTES = 160;
const MASUMI_MINUTXO_RESULT_HASH_BUFFER = 50;
const MASUMI_MINUTXO_COOLDOWN_BUFFER = 15;
const MASUMI_MINUTXO_SAFETY_MARGIN = 100;
const MASUMI_MINUTXO_PER_TOKEN_BUFFER = 50;

/**
 * Minimum lovelace the escrow output must carry, computed on the datum as it will look
 * after `SubmitResult` (32-byte `result_hash` + buffers), mirroring Masumi's `calculateMinUtxo`.
 */
export const masumiMinUtxoLovelace = (
  lockDatumBytes: number,
  nativeTokenCount: number,
  coinsPerUtxoByte: bigint,
): bigint => {
  const totalBytes =
    lockDatumBytes +
    MASUMI_RESULT_HASH_DELTA_BYTES +
    MASUMI_MINUTXO_OVERHEAD_BYTES +
    MASUMI_MINUTXO_RESULT_HASH_BUFFER +
    MASUMI_MINUTXO_COOLDOWN_BUFFER +
    MASUMI_MINUTXO_SAFETY_MARGIN +
    MASUMI_MINUTXO_PER_TOKEN_BUFFER * nativeTokenCount;
  return coinsPerUtxoByte * BigInt(totalBytes);
};

/**
 * The `collateral_return_lovelace` a lock must carry. The seller never supplies or signs
 * this value: the client computes it from the requested asset and live protocol parameters,
 * and the escrow output must satisfy `lockedLovelace = requestedLovelace + collateral`.
 *
 * A lovelace payment can run with zero collateral when the requested amount already clears
 * the post-`SubmitResult` min-UTXO. A native-token payment has `requestedLovelace = 0`, so
 * the collateral must be at least the larger of the floor and that min-UTXO.
 */
export const masumiCollateralLovelace = (
  requestedLovelace: bigint,
  lockDatumBytes: number,
  nativeTokenCount: number,
  coinsPerUtxoByte: bigint,
): bigint => {
  const minUtxo = masumiMinUtxoLovelace(lockDatumBytes, nativeTokenCount, coinsPerUtxoByte);
  if (requestedLovelace >= minUtxo) return 0n;
  const shortfall = minUtxo - requestedLovelace;
  return shortfall > MASUMI_MIN_COLLATERAL_LOVELACE ? shortfall : MASUMI_MIN_COLLATERAL_LOVELACE;
};
