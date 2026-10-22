import { GovernanceActionKind } from "@meshsdk/common";
import { Cardano, deserializeTx } from "@meshsdk/core-cst";

/** A key or script credential, by hash */
export type CredentialRef = { type: "key" | "script"; hash: string };

/** The purpose of a governance action */
export type GovActionType = GovernanceActionKind;

export type GovActionRef = { txHash: string; index: number };

/** A registered stake address */
export type LedgerAccount = {
  rewardAddress: string;
  /** Deposit paid on registration */
  deposit: bigint;
  rewards: bigint;
  /** Key hash of the pool the stake is delegated to */
  pool?: string;
  /** CIP-129 id of the DRep the vote is delegated to, or `alwaysAbstain` / `alwaysNoConfidence` */
  drep?: string;
};

export type LedgerPool = {
  /** Key hash of the pool operator */
  poolId: string;
  deposit: bigint;
  /** Epoch at which a pending retirement takes effect */
  retirementEpoch?: number;
};

export type LedgerDRep = {
  /** CIP-129 id */
  drepId: string;
  deposit: bigint;
};

export type LedgerGovAction = GovActionRef & {
  type: GovActionType;
  /** Still open for votes */
  active: boolean;
  /** For a parameter change: the protocol parameters it changes */
  changedParameters?: string[];
};

export type LedgerCommitteeMember = {
  cold: CredentialRef;
  hot?: CredentialRef;
  resigned: boolean;
  /** Proposed by an update-committee action not yet enacted, rather than a sitting member */
  potential: boolean;
};

/**
 * Ledger state beyond UTxOs that transactions read and change: stake addresses, pools, DReps,
 * governance actions, the constitutional committee and the treasury. UTxOs themselves are kept
 * by the Scalus ledger.
 */
export type LedgerState = {
  accounts: Map<string, LedgerAccount>;
  pools: Map<string, LedgerPool>;
  dreps: Map<string, LedgerDRep>;
  govActions: Map<string, LedgerGovAction>;
  /** The last enacted action of each purpose, which a new proposal of that purpose must follow */
  lastEnacted: Map<GovActionType, GovActionRef>;
  committee: Map<string, LedgerCommitteeMember>;
  treasury: bigint;
  /** The constitution's guardrail script, which parameter changes and treasury withdrawals run */
  guardrailScriptHash?: string;
};

export const govActionKey = ({ txHash, index }: GovActionRef) =>
  `${txHash.toLowerCase()}#${index}`;

export const credentialKey = ({ type, hash }: CredentialRef) =>
  `${type}:${hash.toLowerCase()}`;

const toCredentialRef = (credential: {
  type: Cardano.CredentialType;
  hash: unknown;
}): CredentialRef => ({
  type:
    credential.type === Cardano.CredentialType.ScriptHash ? "script" : "key",
  hash: String(credential.hash),
});

/** The CIP-129 id of a DRep, from any of its ids */
export const normalizeDRepId = (drepId: string): string => {
  const credential = Cardano.DRepID.toCredential(Cardano.DRepID(drepId));
  return Cardano.DRepID.cip129FromCredential(credential).toString();
};

/** The key hash of a pool, from its bech32 id or the hash itself */
export const normalizePoolId = (pool: string): string =>
  /^[0-9a-fA-F]{56}$/.test(pool)
    ? pool.toLowerCase()
    : Cardano.PoolId.toKeyHash(Cardano.PoolId(pool)).toString();

const GOV_ACTION_TYPES: Record<string, GovActionType> = {
  [Cardano.GovernanceActionType.parameter_change_action]:
    GovernanceActionKind.ParameterChangeAction,
  [Cardano.GovernanceActionType.hard_fork_initiation_action]:
    GovernanceActionKind.HardForkInitiationAction,
  [Cardano.GovernanceActionType.treasury_withdrawals_action]:
    GovernanceActionKind.TreasuryWithdrawalsAction,
  [Cardano.GovernanceActionType.no_confidence]:
    GovernanceActionKind.NoConfidenceAction,
  [Cardano.GovernanceActionType.update_committee]:
    GovernanceActionKind.UpdateCommitteeAction,
  [Cardano.GovernanceActionType.new_constitution]:
    GovernanceActionKind.NewConstitutionAction,
  [Cardano.GovernanceActionType.info_action]: GovernanceActionKind.InfoAction,
};

export const cloneLedgerState = (state: LedgerState): LedgerState =>
  structuredClone(state);

/**
 * Applies the effects of an accepted transaction beyond UTxOs: withdrawals, certificates and
 * proposals. A transaction marked as failing phase-2 validation only forfeits its collateral,
 * so it changes nothing here.
 */
export const applyTransaction = (
  state: LedgerState,
  txHex: string,
  networkId: 0 | 1,
  deposits: { keyDeposit: bigint; poolDeposit: bigint; drepDeposit: bigint },
): void => {
  const tx = deserializeTx(txHex);
  if (!tx.isValid()) return;
  const body = tx.body();
  const txHash = tx.getId().toString();
  const rewardAddressOf = (credential: CredentialRef) =>
    Cardano.RewardAddress.fromCredentials(networkId, {
      type:
        credential.type === "script"
          ? Cardano.CredentialType.ScriptHash
          : Cardano.CredentialType.KeyHash,
      hash: credential.hash as never,
    })
      .toAddress()
      .toBech32();
  const account = (credential: CredentialRef) =>
    state.accounts.get(rewardAddressOf(credential));
  const register = (credential: CredentialRef, deposit: bigint) => {
    const rewardAddress = rewardAddressOf(credential);
    state.accounts.set(rewardAddress, { rewardAddress, deposit, rewards: 0n });
  };
  const drepOf = (drep: unknown): string => {
    const d = drep as {
      __typename?: string;
      type?: Cardano.CredentialType;
      hash?: unknown;
    };
    if (d.__typename === "AlwaysAbstain") return "alwaysAbstain";
    if (d.__typename === "AlwaysNoConfidence") return "alwaysNoConfidence";
    return Cardano.DRepID.cip129FromCredential({
      type: d.type!,
      hash: d.hash as never,
    }).toString();
  };
  const poolOf = (poolId: unknown) =>
    Cardano.PoolId.toKeyHash(poolId as Cardano.PoolId).toString();

  for (const [rewardAccount, amount] of body.withdrawals() ?? new Map()) {
    const withdrawn = state.accounts.get(rewardAccount.toString());
    if (withdrawn) withdrawn.rewards -= amount;
  }

  for (const certificate of body.certs()?.values() ?? []) {
    const core = certificate.toCore() as { __typename: string } & Record<
      string,
      any
    >;
    switch (core.__typename) {
      case Cardano.CertificateType.StakeRegistration:
        register(toCredentialRef(core.stakeCredential), deposits.keyDeposit);
        break;
      case Cardano.CertificateType.Registration:
        register(toCredentialRef(core.stakeCredential), BigInt(core.deposit));
        break;
      case Cardano.CertificateType.StakeDeregistration:
      case Cardano.CertificateType.Unregistration:
        state.accounts.delete(
          rewardAddressOf(toCredentialRef(core.stakeCredential)),
        );
        break;
      case Cardano.CertificateType.StakeRegistrationDelegation:
      case Cardano.CertificateType.VoteRegistrationDelegation:
      case Cardano.CertificateType.StakeVoteRegistrationDelegation:
        register(toCredentialRef(core.stakeCredential), BigInt(core.deposit));
      // falls through: these also delegate
      case Cardano.CertificateType.StakeDelegation:
      case Cardano.CertificateType.VoteDelegation:
      case Cardano.CertificateType.StakeVoteDelegation: {
        const delegator = account(toCredentialRef(core.stakeCredential));
        if (!delegator) break;
        if (core.poolId) delegator.pool = poolOf(core.poolId);
        if (core.dRep) delegator.drep = drepOf(core.dRep);
        break;
      }
      case Cardano.CertificateType.PoolRegistration: {
        const poolId = poolOf(core.poolParameters.id);
        const existing = state.pools.get(poolId);
        // Re-registering updates the parameters and cancels a pending retirement
        state.pools.set(poolId, {
          poolId,
          deposit: existing?.deposit ?? deposits.poolDeposit,
        });
        break;
      }
      case Cardano.CertificateType.PoolRetirement: {
        const pool = state.pools.get(poolOf(core.poolId));
        if (pool) pool.retirementEpoch = Number(core.epoch);
        break;
      }
      case Cardano.CertificateType.RegisterDelegateRepresentative: {
        const drepId = drepOf(core.dRepCredential);
        state.dreps.set(drepId, { drepId, deposit: BigInt(core.deposit) });
        break;
      }
      case Cardano.CertificateType.UnregisterDelegateRepresentative:
        state.dreps.delete(drepOf(core.dRepCredential));
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
  }

  [...(body.proposalProcedures()?.values() ?? [])].forEach(
    (proposal, index) => {
      const action = proposal.toCore().governanceAction as {
        __typename: string;
        protocolParamUpdate?: Record<string, unknown>;
        membersToBeAdded?: Iterable<{
          coldCredential: { type: Cardano.CredentialType; hash: unknown };
        }>;
      };
      const type = GOV_ACTION_TYPES[action.__typename];
      if (!type) return;
      state.govActions.set(govActionKey({ txHash, index }), {
        txHash,
        index,
        type,
        active: true,
        ...(action.protocolParamUpdate && {
          changedParameters: Object.entries(action.protocolParamUpdate)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([name]) => name),
        }),
      });
      // Members proposed for the committee may authorise hot credentials before enactment
      for (const member of action.membersToBeAdded ?? []) {
        const cold = toCredentialRef(member.coldCredential);
        if (!state.committee.has(credentialKey(cold)))
          state.committee.set(credentialKey(cold), {
            cold,
            resigned: false,
            potential: true,
          });
      }
    },
  );
};
