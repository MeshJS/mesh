import type { Anchor, GovernanceActionKind } from "@meshsdk/common";
import { Cardano, deserializeTx } from "@meshsdk/core-cst";

import {
  credentialKey,
  CredentialRef,
  drepTargetOf,
  GovPurpose,
  normalizePoolId,
  rewardAddressOf,
  toCredentialRef,
  TxRefs,
} from "./tx-refs";

export type LedgerAccount = {
  /** Deposit paid on registration; left out while unknown */
  deposit?: bigint;
  rewards: bigint;
  /** Rewards withdrawn so far */
  withdrawn: bigint;
  /** Key hash of the pool the stake is delegated to */
  pool?: string;
  /** CIP-129 id of the DRep the vote is delegated to, or `alwaysAbstain` / `alwaysNoConfidence` */
  drep?: string;
};

export type LedgerPool = {
  /** Left out while unknown */
  deposit?: bigint;
  /** Epoch at which a pending retirement takes effect */
  retirementEpoch?: number;
  /** The reward address the deposit goes back to on retirement, when known */
  rewardAddress?: string;
};

export type LedgerGovAction = {
  kind: GovernanceActionKind;
  /** The last epoch votes are accepted in; left out for an action open until closed */
  expiresAfter?: number;
  /** No longer open to votes, whatever the epoch */
  closed?: boolean;
  deposit?: bigint;
  returnAddress?: string;
  /**
   * For a parameter change: the parameters it changes, by CDDL key as text or by name; left out
   * while unknown
   */
  changedParameters?: string[];
  /** The action it follows, by `txHash#index`, for a kind that names one */
  previous?: string;
};

export type LedgerCommitteeMember = {
  cold: CredentialRef;
  hot?: CredentialRef;
  resigned: boolean;
  /** Proposed by an update-committee action not yet enacted, rather than sitting */
  potential: boolean;
  /**
   * For a member that is potential only because committee updates submitted here propose it:
   * those actions, by `txHash#index`. As in the ledger, it is no member at all once the last of
   * them is gone.
   */
  proposedBy?: string[];
};

export type EnactedAction = {
  txHash: string;
  index: number;
  kind: GovernanceActionKind;
};

/**
 * Ledger state beyond UTxOs that transactions read and change. UTxOs themselves are kept by
 * the Scalus ledger.
 */
export type LedgerState = {
  /** By reward address */
  accounts: Map<string, LedgerAccount>;
  /** By key hash */
  pools: Map<string, LedgerPool>;
  /** By CIP-129 id, with the deposit paid, when known */
  dreps: Map<string, { deposit?: bigint }>;
  /** By `txHash#index` */
  govActions: Map<string, LedgerGovAction>;
  lastEnacted: Map<GovPurpose, EnactedAction>;
  /** By cold credential */
  committee: Map<string, LedgerCommitteeMember>;
  /** Left out while unknown */
  treasury?: bigint;
  /** Donations of the current epoch, which join the treasury at the next epoch boundary */
  donations: bigint;
  /** Left out while unknown; without a guardrail script hash, the constitution has none */
  constitution?: { anchor: Anchor; guardrailScriptHash?: string };
  /**
   * Set for a ledger read from a provider, which knows only the items it read, by item key,
   * and why the others are unknown. A ledger created from options knows everything.
   */
  partial?: { known: Set<string>; reasons: Map<string, string> };
};

/** The keys of items a partial ledger may or may not know */
export const item = {
  account: (rewardAddress: string) => `account:${rewardAddress}`,
  /** The DRep delegation of a stake address whose registration is known */
  drepDelegation: (rewardAddress: string) => `drepDelegation:${rewardAddress}`,
  pool: (poolHash: string) => `pool:${poolHash}`,
  drep: (drepId: string) => `drep:${drepId}`,
  govAction: (key: string) => `govAction:${key}`,
  /** The whole constitutional committee: who sits on it and who is proposed */
  committee: "committee",
  /** One committee member, by the key of its cold credential */
  committeeMember: (coldKey: string) => `committeeMember:${coldKey}`,
  lastEnacted: (purpose: GovPurpose) => `lastEnacted:${purpose}`,
};

export const isKnown = (state: LedgerState, key: string): boolean =>
  !state.partial || state.partial.known.has(key);

export const unknownReason = (state: LedgerState, key: string): string =>
  state.partial?.reasons.get(key) ?? "it was not read from the provider";

/** Marks an item as known, in a partial ledger */
export const learn = (state: LedgerState, key: string) => {
  state.partial?.known.add(key);
  state.partial?.reasons.delete(key);
};

/** Whether a committee member is known: the whole committee, or that member alone */
export const isMemberKnown = (state: LedgerState, cold: CredentialRef) =>
  isKnown(state, item.committee) ||
  isKnown(state, item.committeeMember(credentialKey(cold)));

/** A ledger with nothing registered, which knows everything */
export const emptyLedgerState = (): LedgerState => ({
  accounts: new Map(),
  pools: new Map(),
  dreps: new Map(),
  govActions: new Map(),
  lastEnacted: new Map(),
  committee: new Map(),
  donations: 0n,
});

export const cloneLedgerState = (state: LedgerState): LedgerState =>
  structuredClone(state);

/** Removes a pool, undelegating the stake delegated to it */
export const dropPool = (state: LedgerState, poolHash: string) => {
  state.pools.delete(poolHash);
  learn(state, item.pool(poolHash));
  for (const account of state.accounts.values())
    if (account.pool === poolHash) delete account.pool;
};

/** Removes a DRep, undelegating the votes delegated to it */
export const dropDRep = (state: LedgerState, drepId: string) => {
  state.dreps.delete(drepId);
  learn(state, item.drep(drepId));
  for (const account of state.accounts.values())
    if (account.drep === drepId) delete account.drep;
};

/** Removes a governance action, and the committee members only it proposed */
export const dropGovAction = (state: LedgerState, key: string) => {
  state.govActions.delete(key);
  learn(state, item.govAction(key));
  for (const [coldKey, member] of state.committee) {
    if (!member.proposedBy?.includes(key)) continue;
    member.proposedBy = member.proposedBy.filter((action) => action !== key);
    if (member.proposedBy.length === 0) state.committee.delete(coldKey);
  }
};

/**
 * Pays a deposit back to a stake address's rewards, or to the treasury if the address is not
 * registered. A partial ledger may not know the amount, or the address or whether it is
 * registered: where the deposit may have gone is then no longer known either.
 */
const payBack = (
  state: LedgerState,
  rewardAddress: string | undefined,
  amount: bigint | undefined,
) => {
  const placed =
    rewardAddress === undefined
      ? !state.partial
      : isKnown(state, item.account(rewardAddress));
  const account = placed && rewardAddress && state.accounts.get(rewardAddress);
  if (account && amount !== undefined) account.rewards += amount;
  else if (account) {
    state.accounts.delete(rewardAddress!);
    state.partial?.known.delete(item.account(rewardAddress!));
    state.partial?.reasons.set(
      item.account(rewardAddress!),
      "it was paid back a deposit of an amount that is not known",
    );
  } else if (state.treasury !== undefined)
    if (placed && amount !== undefined) state.treasury += amount;
    else delete state.treasury;
};

/**
 * Applies the effects of an accepted transaction beyond UTxOs: withdrawals, certificates,
 * proposals and donations. A transaction marked as failing phase-2 validation only forfeits
 * its collateral, so it changes nothing here.
 */
export const applyTransaction = (
  state: LedgerState,
  txHex: string,
  refs: TxRefs,
  context: {
    networkId: 0 | 1;
    epoch: number;
    keyDeposit: bigint;
    poolDeposit: bigint;
    govActionLifetime: number;
    /** Pools the ledger did not know that the transaction registers anew, paying the deposit */
    newPools?: ReadonlySet<string>;
  },
): void => {
  if (!refs.isValid) return;
  const tx = deserializeTx(txHex);
  const txHash = tx.getId().toString();
  const accountOf = (credential: Cardano.Credential) =>
    rewardAddressOf(toCredentialRef(credential), context.networkId);
  const register = (rewardAddress: string, deposit: bigint) => {
    state.accounts.set(rewardAddress, { deposit, rewards: 0n, withdrawn: 0n });
    learn(state, item.account(rewardAddress));
    learn(state, item.drepDelegation(rewardAddress));
  };

  // Withdrawals are applied before certificates, as the ledger does
  for (const [rewardAddress, amount] of refs.withdrawals) {
    const account = state.accounts.get(rewardAddress);
    if (!account) continue;
    account.rewards -= amount;
    account.withdrawn += amount;
  }

  for (const certificate of tx.body().certs()?.values() ?? []) {
    const core = certificate.toCore() as { __typename: string } & Record<
      string,
      any
    >;
    switch (core.__typename) {
      case Cardano.CertificateType.StakeRegistration:
        register(accountOf(core.stakeCredential), context.keyDeposit);
        break;
      case Cardano.CertificateType.Registration:
      case Cardano.CertificateType.StakeRegistrationDelegation:
      case Cardano.CertificateType.VoteRegistrationDelegation:
      case Cardano.CertificateType.StakeVoteRegistrationDelegation:
        register(accountOf(core.stakeCredential), BigInt(core.deposit));
        break;
      case Cardano.CertificateType.StakeDeregistration:
      case Cardano.CertificateType.Unregistration: {
        const rewardAddress = accountOf(core.stakeCredential);
        state.accounts.delete(rewardAddress);
        learn(state, item.account(rewardAddress));
        break;
      }
      case Cardano.CertificateType.PoolRegistration: {
        const params = core.poolParameters;
        const poolId = normalizePoolId(String(params.id));
        const existing = state.pools.get(poolId);
        // Re-registering updates the parameters, keeping the deposit paid first, and cancels a
        // pending retirement. A pool the ledger did not know paid its deposit before, of an
        // amount not known, unless the transaction registers it anew.
        const paysDeposit =
          isKnown(state, item.pool(poolId)) || context.newPools?.has(poolId);
        const deposit = existing
          ? existing.deposit
          : paysDeposit
            ? context.poolDeposit
            : undefined;
        state.pools.set(poolId, {
          ...(deposit !== undefined && { deposit }),
          rewardAddress: String(params.rewardAccount),
        });
        learn(state, item.pool(poolId));
        break;
      }
      case Cardano.CertificateType.PoolRetirement: {
        const pool = state.pools.get(normalizePoolId(String(core.poolId)));
        if (pool) pool.retirementEpoch = Number(core.epoch);
        break;
      }
      case Cardano.CertificateType.RegisterDelegateRepresentative: {
        const drepId = drepTargetOf(core.dRepCredential);
        state.dreps.set(drepId, { deposit: BigInt(core.deposit) });
        learn(state, item.drep(drepId));
        break;
      }
      case Cardano.CertificateType.UnregisterDelegateRepresentative:
        // Votes delegated to a DRep that leaves are undelegated
        dropDRep(state, drepTargetOf(core.dRepCredential));
        break;
      case Cardano.CertificateType.AuthorizeCommitteeHot: {
        const member = state.committee.get(
          credentialKey(toCredentialRef(core.coldCredential)),
        );
        if (member) member.hot = toCredentialRef(core.hotCredential);
        break;
      }
      case Cardano.CertificateType.ResignCommitteeCold: {
        const member = state.committee.get(
          credentialKey(toCredentialRef(core.coldCredential)),
        );
        if (member) member.resigned = true;
        break;
      }
    }
    // Delegations, alone or with a registration
    if (
      core.poolId &&
      core.__typename !== Cardano.CertificateType.PoolRetirement
    ) {
      const account = state.accounts.get(accountOf(core.stakeCredential));
      if (account) account.pool = normalizePoolId(String(core.poolId));
    }
    if (core.dRep) {
      const rewardAddress = accountOf(core.stakeCredential);
      const account = state.accounts.get(rewardAddress);
      if (account) {
        account.drep = drepTargetOf(core.dRep);
        learn(state, item.drepDelegation(rewardAddress));
      }
    }
  }

  for (const proposal of refs.proposals) {
    const key = `${txHash}#${proposal.index}`;
    state.govActions.set(key, {
      kind: proposal.kind,
      expiresAfter: context.epoch + context.govActionLifetime,
      deposit: proposal.deposit,
      returnAddress: proposal.returnAddress,
      ...(proposal.changedParameters && {
        changedParameters: proposal.changedParameters,
      }),
      ...(proposal.previous && { previous: proposal.previous }),
    });
    learn(state, item.govAction(key));
    // Members proposed for the committee may authorise hot credentials before enactment, for as
    // long as a committee update proposing them is pending
    for (const cold of proposal.addsToCommittee) {
      const member = state.committee.get(credentialKey(cold));
      if (!member)
        state.committee.set(credentialKey(cold), {
          cold,
          resigned: false,
          potential: true,
          proposedBy: [key],
        });
      else member.proposedBy?.push(key);
    }
  }

  state.donations += refs.donation ?? 0n;
};

/**
 * What happens when the clock enters `epoch`: pools due to retire retire, their deposits going
 * back and the stake delegated to them undelegated; the epoch's donations join the treasury;
 * governance actions past their lifetime are removed and their deposits returned. Rewards,
 * ratification and enactment are not computed.
 */
export const enterEpoch = (state: LedgerState, epoch: number): void => {
  for (const [poolId, pool] of state.pools) {
    if (pool.retirementEpoch === undefined || pool.retirementEpoch > epoch)
      continue;
    dropPool(state, poolId);
    payBack(state, pool.rewardAddress, pool.deposit);
  }

  if (state.treasury !== undefined) state.treasury += state.donations;
  state.donations = 0n;

  // An action stays open to votes up to its expiry epoch, and is removed at the boundary after
  // the next one, when the ledger acts on the ratification that found it expired. The actions
  // following it go with it, as they can no longer be enacted.
  const removed = new Set(
    [...state.govActions]
      .filter(
        ([, action]) =>
          action.expiresAfter !== undefined && action.expiresAfter + 2 <= epoch,
      )
      .map(([key]) => key),
  );
  for (let grew = true; grew;) {
    grew = false;
    for (const [key, action] of state.govActions)
      if (
        !removed.has(key) &&
        action.previous &&
        removed.has(action.previous)
      ) {
        removed.add(key);
        grew = true;
      }
  }
  for (const key of removed) {
    const action = state.govActions.get(key)!;
    dropGovAction(state, key);
    if (action.deposit !== undefined)
      payBack(state, action.returnAddress, action.deposit);
  }
};

export const isOpenToVotes = (action: LedgerGovAction, epoch: number) =>
  !action.closed &&
  (action.expiresAfter === undefined || epoch <= action.expiresAfter);
