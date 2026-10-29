import type {
  ConstitutionState,
  EnactedGovernanceAction,
  GovernanceActionId,
} from "@meshsdk/common";
import { Cardano } from "@meshsdk/core-cst";

import type {
  TxEmulatorAccount,
  TxEmulatorCommitteeMember,
  TxEmulatorDRep,
  TxEmulatorGovernanceAction,
  TxEmulatorPool,
} from "./emulator";
import {
  dropDRep,
  dropGovAction,
  dropPool,
  item,
  learn,
  LedgerGovAction,
  LedgerState,
} from "./ledger-state";
import {
  credentialKey,
  fromMeshCredential,
  govActionKey,
  isPredefinedDRep,
  MeshCredential,
  normalizeDRepId,
  normalizePoolId,
  purposeOf,
  rewardAddressOf,
  toCredentialRef,
} from "./tx-refs";

// Changes to the ledger state made without a transaction, at creation or later. Each changes
// what it names, and what the ledger keeps consistent with it, such as the stake delegated to a
// pool that is removed. None pays or refunds a deposit. What a change sets is known from then
// on, in a ledger read from providers too.

/** A reward address in canonical form, checked to be one of the emulated network */
const accountKey = (rewardAddress: string, networkId: 0 | 1): string => {
  const address = Cardano.Address.fromString(rewardAddress);
  const credential = address?.asReward()?.getPaymentCredential();
  if (!address || !credential)
    throw new Error(`${rewardAddress} is not a reward address`);
  if (address.getNetworkId() !== networkId)
    throw new Error(
      `${rewardAddress} is not a reward address of the emulated network`,
    );
  return rewardAddressOf(toCredentialRef(credential), networkId);
};

/** Fields left out keep their values; `null` clears an optional one */
const changed = <T>(
  given: T | null | undefined,
  current: T | undefined,
): T | undefined =>
  given === undefined ? current : given === null ? undefined : given;

/**
 * Registers a stake address, or changes a registered one. Fields left out keep their values, or
 * take their defaults for a new registration.
 */
export const putAccount = (
  state: LedgerState,
  account: TxEmulatorAccount,
  context: { networkId: 0 | 1; keyDeposit: bigint },
): void => {
  const rewardAddress = accountKey(account.rewardAddress, context.networkId);
  const current = state.accounts.get(rewardAddress);
  const pool = changed(
    account.poolId && normalizePoolId(account.poolId),
    current?.pool,
  );
  const drep = changed(
    account.drep &&
      (isPredefinedDRep(account.drep)
        ? account.drep
        : normalizeDRepId(account.drep)),
    current?.drep,
  );
  const deposit =
    account.deposit !== undefined
      ? BigInt(account.deposit)
      : current
        ? current.deposit
        : context.keyDeposit;
  state.accounts.set(rewardAddress, {
    ...(deposit !== undefined && { deposit }),
    rewards:
      account.rewards !== undefined
        ? BigInt(account.rewards)
        : (current?.rewards ?? 0n),
    withdrawn: current?.withdrawn ?? 0n,
    ...(pool && { pool }),
    ...(drep && { drep }),
  });
  learn(state, item.account(rewardAddress));
  // A new registration has the DRep delegation given; a registered address keeps what is known
  if (!current || account.drep !== undefined)
    learn(state, item.drepDelegation(rewardAddress));
};

/** Removes a stake address's registration, with its rewards and delegations */
export const removeAccount = (
  state: LedgerState,
  rewardAddress: string,
  networkId: 0 | 1,
): void => {
  const key = accountKey(rewardAddress, networkId);
  state.accounts.delete(key);
  learn(state, item.account(key));
};

/**
 * Registers a stake pool, or changes a registered one. Fields left out keep their values, or
 * take their defaults for a new pool.
 */
export const putPool = (
  state: LedgerState,
  pool: TxEmulatorPool,
  context: { networkId: 0 | 1; poolDeposit: bigint },
): void => {
  const poolHash = normalizePoolId(pool.poolId);
  const current = state.pools.get(poolHash);
  const retirementEpoch = changed(
    pool.retirementEpoch,
    current?.retirementEpoch,
  );
  const rewardAddress = pool.rewardAddress
    ? accountKey(pool.rewardAddress, context.networkId)
    : current?.rewardAddress;
  const deposit =
    pool.deposit !== undefined
      ? BigInt(pool.deposit)
      : current
        ? current.deposit
        : context.poolDeposit;
  state.pools.set(poolHash, {
    ...(deposit !== undefined && { deposit }),
    ...(retirementEpoch !== undefined && { retirementEpoch }),
    ...(rewardAddress && { rewardAddress }),
  });
  learn(state, item.pool(poolHash));
};

/** Removes a stake pool, undelegating the stake delegated to it as its retirement would */
export const removePool = (state: LedgerState, poolId: string): void =>
  dropPool(state, normalizePoolId(poolId));

/** Registers a DRep, or changes the deposit of a registered one */
export const putDRep = (
  state: LedgerState,
  drep: TxEmulatorDRep,
  drepDeposit: bigint,
): void => {
  const drepId = normalizeDRepId(drep.drepId);
  const current = state.dreps.get(drepId);
  const deposit =
    drep.deposit !== undefined
      ? BigInt(drep.deposit)
      : current
        ? current.deposit
        : drepDeposit;
  state.dreps.set(drepId, { ...(deposit !== undefined && { deposit }) });
  learn(state, item.drep(drepId));
};

/** Removes a DRep, undelegating the votes delegated to it as its leaving would */
export const removeDRep = (state: LedgerState, drepId: string): void =>
  dropDRep(state, normalizeDRepId(drepId));

/**
 * Adds a governance action, or changes one. Fields left out keep their values; a new action is
 * open to votes until closed.
 */
export const putGovernanceAction = (
  state: LedgerState,
  action: TxEmulatorGovernanceAction,
): void => {
  const key = govActionKey(action.transactionId, action.govActionIndex);
  const next: LedgerGovAction = {
    ...state.govActions.get(key),
    kind: action.kind,
  };
  if (action.active === false) next.closed = true;
  if (action.active === true) delete next.closed;
  if (action.changedParameters)
    next.changedParameters = [...action.changedParameters];
  state.govActions.set(key, next);
  learn(state, item.govAction(key));
};

/**
 * Removes a governance action, with the committee members only it proposed; the actions
 * following it stay, as when it is enacted
 */
export const removeGovernanceAction = (
  state: LedgerState,
  action: GovernanceActionId,
): void =>
  dropGovAction(
    state,
    govActionKey(action.transactionId, action.govActionIndex),
  );

/** Sets the last enacted action of the purpose its kind serves */
export const putLastEnacted = (
  state: LedgerState,
  action: EnactedGovernanceAction,
): void => {
  const purpose = purposeOf(action.kind);
  if (!purpose)
    throw new Error(
      `${action.kind} actions do not follow one another, so none is the last enacted`,
    );
  state.lastEnacted.set(purpose, {
    txHash: action.transactionId.toLowerCase(),
    index: action.govActionIndex,
    kind: action.kind,
  });
  learn(state, item.lastEnacted(purpose));
};

/**
 * Adds a constitutional committee member, or changes one, by cold credential. Fields left out
 * keep their values; a new member is sitting, has not resigned, and has no hot credential.
 */
export const putCommitteeMember = (
  state: LedgerState,
  member: TxEmulatorCommitteeMember,
): void => {
  const cold = fromMeshCredential(member.cold);
  const key = credentialKey(cold);
  const current = state.committee.get(key);
  const hot = changed(
    member.hot && fromMeshCredential(member.hot),
    current?.hot,
  );
  state.committee.set(key, {
    cold,
    ...(hot && { hot }),
    resigned: member.resigned ?? current?.resigned ?? false,
    potential: member.potential ?? current?.potential ?? false,
    // A membership left as it was stays that of the committee updates proposing the member
    ...(member.potential === undefined &&
      current?.proposedBy && { proposedBy: current.proposedBy }),
  });
  learn(state, item.committeeMember(key));
};

export const removeCommitteeMember = (
  state: LedgerState,
  cold: MeshCredential,
): void => {
  const key = credentialKey(fromMeshCredential(cold));
  state.committee.delete(key);
  learn(state, item.committeeMember(key));
};

export const putConstitution = (
  state: LedgerState,
  constitution: ConstitutionState,
): void => {
  state.constitution = {
    anchor: { ...constitution.anchor },
    ...(constitution.guardrailScriptHash && {
      guardrailScriptHash: constitution.guardrailScriptHash.toLowerCase(),
    }),
  };
};
