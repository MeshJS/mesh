import { isKnown, item, LedgerState } from "./ledger-state";
import { TxRefs } from "./tx-refs";

/**
 * What a transaction needs of the state the ledger does not know, before it is applied. Such
 * state is taken to be as the transaction needs it, so that it cannot fail the transaction, and
 * is reported as not checked.
 */
export type Assumed = {
  /**
   * Unknown stake addresses its first certificate (de)registering them registers: they cannot be
   * registered before it. Any other unknown one is registered, holding what it withdraws.
   */
  newAccounts: Set<string>;
  /** Unknown pools it registers anew, paying the deposit. Any other unknown one is registered. */
  newPools: Set<string>;
  /**
   * Unknown DReps its first certificate (de)registering them registers. Any other unknown one is
   * registered.
   */
  newDReps: Set<string>;
  /**
   * The deposits it reclaims that the ledger does not know, by reward address or DRep id, as
   * it reclaims them
   */
  deposits: Map<string, bigint>;
};

export type AssumeContext = {
  keyDeposit: bigint;
  poolDeposit: bigint;
  /** Lovelace the transaction spends */
  coinIn: bigint;
  /** Lovelace it pays to its outputs and as its fee */
  coinOut: bigint;
};

/**
 * The lovelace a transaction leaves over: what it spends, withdraws and reclaims, less what it
 * pays out and deposits. Pools the ledger does not know count as registered, so that their
 * registrations pay no deposit, and deposits it does not know as the current one, unless
 * `assumed` says otherwise.
 */
const coinSurplus = (
  state: LedgerState,
  refs: TxRefs,
  assumed: Assumed,
  context: AssumeContext,
): bigint => {
  let surplus = context.coinIn - context.coinOut - (refs.donation ?? 0n);
  for (const amount of refs.withdrawals.values()) surplus += amount;
  for (const proposal of refs.proposals) surplus -= proposal.deposit;
  // Deposits paid by the transaction itself, reclaimed by a later deregistration
  const paid = new Map<string, bigint>();
  const registeredPools = new Set<string>();
  for (const { kind, key, register, amount } of refs.registrations) {
    if (kind === "pool") {
      const isNew =
        !registeredPools.has(key) &&
        isKnown(state, item.pool(key)) &&
        !state.pools.has(key);
      if (isNew) surplus -= context.poolDeposit;
      registeredPools.add(key);
    } else if (kind === "drep") surplus += register ? -amount! : amount!;
    else if (register) {
      const deposit = amount ?? context.keyDeposit;
      surplus -= deposit;
      paid.set(key, deposit);
    } else
      surplus +=
        amount ??
        paid.get(key) ??
        state.accounts.get(key)?.deposit ??
        assumed.deposits.get(key) ??
        context.keyDeposit;
  }
  return surplus;
};

/**
 * What a transaction needs of the state the ledger does not know. The first certificate
 * touching an unknown stake address or DRep says whether it was registered before: a
 * registration needs it unregistered, anything else registered. Deposits the ledger does not
 * know are the refunds the transaction states. Whether an unknown pool it registers is new,
 * paying a deposit, or registered already, re-registering for free, and a refund it reclaims
 * without stating it, follow from what balances the transaction.
 */
export const assumedState = (
  state: LedgerState,
  refs: TxRefs,
  context: AssumeContext,
): Assumed => {
  const assumed: Assumed = {
    newAccounts: new Set(),
    newPools: new Set(),
    newDReps: new Set(),
    deposits: new Map(),
  };
  if (!state.partial) return assumed;

  const seen = new Set<string>();
  const unknownPools: string[] = [];
  /** Reward addresses whose unknown deposit the transaction reclaims without stating it */
  const unstated: string[] = [];
  for (const { kind, key, register, amount } of refs.registrations) {
    if (seen.has(`${kind}:${key}`)) continue;
    seen.add(`${kind}:${key}`);
    if (kind === "pool") {
      if (!isKnown(state, item.pool(key))) unknownPools.push(key);
      continue;
    }
    const known = isKnown(
      state,
      kind === "account" ? item.account(key) : item.drep(key),
    );
    if (register) {
      if (!known)
        (kind === "account" ? assumed.newAccounts : assumed.newDReps).add(key);
      continue;
    }
    const held =
      kind === "account" ? state.accounts.get(key) : state.dreps.get(key);
    // The deposit reclaimed is known for a known registration that knows it
    if (known && (!held || held.deposit !== undefined)) continue;
    if (amount !== undefined) assumed.deposits.set(key, amount);
    else unstated.push(key);
  }

  if (!refs.isValid || unknownPools.length + unstated.length === 0)
    return assumed;
  const surplus = coinSurplus(state, refs, assumed, context);
  if (surplus === 0n) return assumed;
  const newPools = surplus / context.poolDeposit;
  if (
    surplus > 0n &&
    surplus % context.poolDeposit === 0n &&
    newPools <= BigInt(unknownPools.length)
  )
    for (const poolHash of unknownPools.slice(0, Number(newPools)))
      assumed.newPools.add(poolHash);
  else if (unstated.length === 1 && context.keyDeposit > surplus)
    assumed.deposits.set(unstated[0]!, context.keyDeposit - surplus);
  return assumed;
};
