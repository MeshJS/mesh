/**
 * Slot<->time conversion for building spend transactions against `vested_pay`. Cardano slots
 * are 1 second each (post-Shelley, on mainnet/preprod/preview alike), so a target's slot can be
 * derived relative to "now" without needing each network's genesis start time as a constant -
 * the same technique already used and proven in `facilitator/masumiVerify.ts`'s TTL check.
 */

/** Converts a POSIX-millisecond timestamp to a slot number, relative to a known (slot, time) pair. */
export const unixMsToSlot = (targetUnixMs: number, currentSlot: number, nowMs: number = Date.now()): number =>
  currentSlot + Math.round((targetUnixMs - nowMs) / 1000);

/**
 * `must_start_after(range, T)` requires the tx's validity range LOWER bound to be Finite and
 * `>= T`. Rounding a POSIX-ms target up to the next slot boundary keeps `invalidBefore` from
 * landing fractionally before `T` due to slot-boundary rounding.
 *
 * Clamped to `currentSlot` when `T` is at or before "now" - this covers both a genuinely past
 * deadline (trivially satisfied by starting right now) and the datum's `0` sentinel for
 * "cooldown never set" (e.g. a fresh lock's `sellerCooldownTime`/`buyerCooldownTime`), which is
 * `0` POSIX-ms - epoch 1970 - not a real target relative to "now". Without this clamp, `T=0`
 * computes a wildly negative slot number (`currentSlot - ~56 years of seconds`), corrupting the
 * transaction's validity range.
 */
export const slotAtOrAfter = (targetUnixMs: number, currentSlot: number, nowMs: number = Date.now()): number =>
  Math.max(currentSlot, Math.ceil(currentSlot + (targetUnixMs - nowMs) / 1000));

/**
 * `must_end_before(range, T)` requires the tx's validity range UPPER bound to be Finite and
 * strictly `< T`. Rounding down keeps `invalidHereafter` safely clear of `T`.
 */
export const slotStrictlyBefore = (targetUnixMs: number, currentSlot: number, nowMs: number = Date.now()): number =>
  Math.floor(currentSlot + (targetUnixMs - nowMs) / 1000) - 1;

/**
 * Inverse of `unixMsToSlot`: the POSIX-ms timestamp a given slot corresponds to.
 *
 * Needed because the validator computes `cooldown_time` as `tx_latest_time + cooldown_period`,
 * where `tx_latest_time` is the *transaction's own* validity-range upper bound (converted to
 * POSIX ms by the ledger before the script runs) - not wall-clock "now". A `SubmitResult`
 * transaction's `invalidHereafter` is typically set close to `submit_result_time` (to satisfy
 * `must_end_before`), which can be far in the future relative to when the transaction is
 * actually built - so a cooldown computed from `Date.now()` instead of from the tx's own
 * `invalidHereafter` would be far too small, failing the continuation datum's
 * `seller_cooldown_time >= cooldown_time` (or `buyer_cooldown_time >= cooldown_time`) check.
 */
export const slotToUnixMs = (slot: number, currentSlot: number, nowMs: number = Date.now()): number =>
  nowMs + (slot - currentSlot) * 1000;

/**
 * Plenty of real-world margin for building/submitting a transaction (slots are 1 second each -
 * 600 slots is 10 minutes, generous for build+broadcast+confirm), while staying short enough
 * that any `cooldown_time` derived from this validity range (see `slotToUnixMs`'s doc) stays
 * practically usable. A too-large buffer here directly inflates the resulting cooldown by the
 * same amount, since cooldown = this tx's own upper bound + cooldown_period.
 */
export const TX_VALIDITY_BUFFER_SLOTS = 600;

/**
 * Picks a validity-range upper bound that satisfies `must_end_before(deadlineSlot)` without
 * unnecessarily reaching all the way out to it. A `must_end_before` check only requires the
 * upper bound to be *before* the deadline - it does not need to be *close to* it - so pushing
 * `invalidHereafter` all the way to just-before a distant deadline (e.g. `unlock_time`, often
 * tens of minutes away) needlessly inflates any cooldown computed from this tx's own upper
 * bound (see `slotToUnixMs`'s doc comment) to match.
 */
export const tightUpperBound = (
  deadlineSlot: number,
  currentSlot: number,
  bufferSlots: number = TX_VALIDITY_BUFFER_SLOTS,
): number => Math.min(deadlineSlot, currentSlot + bufferSlots);
