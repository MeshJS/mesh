import type { CommitteeMemberState } from "@meshsdk/common";
import { GovernanceActionKind } from "@meshsdk/common";
import { Cardano, deserializeTx, Serialization } from "@meshsdk/core-cst";

/** A key or script credential, by hash */
export type CredentialRef = { type: "key" | "script"; hash: string };

/** A key or script credential, as Mesh's governance types spell it */
export type MeshCredential = CommitteeMemberState["cold"];

export const fromMeshCredential = (
  credential: MeshCredential,
): CredentialRef =>
  credential.type === "ScriptHash"
    ? { type: "script", hash: credential.scriptHash.toLowerCase() }
    : { type: "key", hash: credential.keyHash.toLowerCase() };

export const toMeshCredential = ({
  type,
  hash,
}: CredentialRef): MeshCredential =>
  type === "script"
    ? { type: "ScriptHash", scriptHash: hash }
    : { type: "KeyHash", keyHash: hash };

/** The purposes whose enacted actions form a chain that each new proposal must extend */
export type GovPurpose =
  "parameterChange" | "hardFork" | "committee" | "constitution";

export const GOV_PURPOSES: readonly GovPurpose[] = [
  "parameterChange",
  "hardFork",
  "committee",
  "constitution",
];

export const purposeOf = (
  kind: GovernanceActionKind,
): GovPurpose | undefined => {
  switch (kind) {
    case GovernanceActionKind.ParameterChangeAction:
      return "parameterChange";
    case GovernanceActionKind.HardForkInitiationAction:
      return "hardFork";
    case GovernanceActionKind.NoConfidenceAction:
    case GovernanceActionKind.UpdateCommitteeAction:
      return "committee";
    case GovernanceActionKind.NewConstitutionAction:
      return "constitution";
    default:
      return undefined;
  }
};

export const GOV_ACTION_KINDS: Record<string, GovernanceActionKind> = {
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

export const govActionKey = (txHash: string, index: number) =>
  `${txHash.toLowerCase()}#${index}`;

export const credentialKey = ({ type, hash }: CredentialRef) =>
  `${type}:${hash.toLowerCase()}`;

export const toCredentialRef = (credential: {
  type: Cardano.CredentialType;
  hash: unknown;
}): CredentialRef => ({
  type:
    credential.type === Cardano.CredentialType.ScriptHash ? "script" : "key",
  hash: String(credential.hash),
});

export const rewardAddressOf = (
  credential: CredentialRef,
  networkId: 0 | 1,
): string =>
  Cardano.RewardAddress.fromCredentials(networkId, {
    type:
      credential.type === "script"
        ? Cardano.CredentialType.ScriptHash
        : Cardano.CredentialType.KeyHash,
    hash: credential.hash as never,
  })
    .toAddress()
    .toBech32();

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

export const bech32PoolId = (poolHash: string): string =>
  Cardano.PoolId.fromKeyHash(poolHash as never).toString();

/** A DRep delegation target: a CIP-129 id, or `alwaysAbstain` / `alwaysNoConfidence` */
export const drepTargetOf = (drep: unknown): string => {
  const d = drep as { __typename?: string; type?: Cardano.CredentialType };
  if (d.__typename === "AlwaysAbstain") return "alwaysAbstain";
  if (d.__typename === "AlwaysNoConfidence") return "alwaysNoConfidence";
  return Cardano.DRepID.cip129FromCredential(
    drep as Cardano.Credential,
  ).toString();
};

export const isPredefinedDRep = (drep: string) =>
  drep === "alwaysAbstain" || drep === "alwaysNoConfidence";

/** The CDDL keys, as text, of the parameters a parameter update sets */
const parameterKeys = (update: Serialization.ProtocolParamUpdate): string[] => {
  const reader = new Serialization.CborReader(update.toCbor());
  const size = reader.readStartMap();
  const keys: string[] = [];
  while (
    size === null
      ? reader.peekState() !== Serialization.CborReaderState.EndMap
      : keys.length < size
  ) {
    keys.push(String(reader.readInt()));
    reader.skipValue();
  }
  return keys;
};

export type ProposalRef = {
  index: number;
  kind: GovernanceActionKind;
  deposit: bigint;
  returnAddress: string;
  /** The action it follows, by `txHash#index`, for a kind that names one */
  previous?: string;
  /** For a parameter change: the CDDL keys of the parameters it changes */
  changedParameters?: string[];
  /** For a committee update: the cold credentials it adds */
  addsToCommittee: CredentialRef[];
};

/**
 * A certificate registering or deregistering a stake address, a pool or a DRep. Certificates
 * apply in order, so what the transaction needs before it, and the deposits it pays and
 * reclaims, follow from the order of these.
 */
export type RegistrationRef = {
  kind: "account" | "pool" | "drep";
  /** The reward address, the pool's key hash or the DRep's CIP-129 id */
  key: string;
  /** False for a deregistration. A pool registration also re-registers a registered pool. */
  register: boolean;
  /** The deposit paid or reclaimed, when the certificate states it */
  amount?: bigint;
};

/** What a transaction reads from, and changes in, the ledger beyond its UTxOs */
export type TxRefs = {
  isValid: boolean;
  /** Reward addresses withdrawn from, with the amounts */
  withdrawals: Map<string, bigint>;
  /** Its registrations and deregistrations, in order */
  registrations: RegistrationRef[];
  /**
   * Every reward address it reads: those withdrawn from, acted on by certificates, receiving
   * proposal deposits back or treasury withdrawals
   */
  accounts: Set<string>;
  /** Key hashes of the pools delegated to, registered, retired or voting */
  pools: Set<string>;
  /** CIP-129 ids of the DReps delegated to, registered, deregistered, updated or voting */
  dreps: Set<string>;
  /** Governance actions voted on, by `txHash#index` */
  votedOn: Set<string>;
  proposals: ProposalRef[];
  /** Committee members acted on by certificates, by cold credential */
  committeeCold: CredentialRef[];
  /** Committee members voting, by hot credential */
  committeeHot: CredentialRef[];
  /** The treasury the transaction states */
  treasury?: bigint;
  donation?: bigint;
};

export const txRefs = (txHex: string, networkId: 0 | 1): TxRefs => {
  const tx = deserializeTx(txHex);
  const body = tx.body();
  const refs: TxRefs = {
    isValid: tx.isValid(),
    withdrawals: new Map(),
    registrations: [],
    accounts: new Set(),
    pools: new Set(),
    dreps: new Set(),
    votedOn: new Set(),
    proposals: [],
    committeeCold: [],
    committeeHot: [],
    ...(body.currentTreasuryValue() !== undefined && {
      treasury: body.currentTreasuryValue(),
    }),
    ...(body.donation() !== undefined && { donation: body.donation() }),
  };

  for (const [rewardAccount, amount] of body.withdrawals() ?? new Map()) {
    const address = String(rewardAccount);
    refs.withdrawals.set(
      address,
      (refs.withdrawals.get(address) ?? 0n) + amount,
    );
    refs.accounts.add(address);
  }

  for (const certificate of body.certs()?.values() ?? []) {
    const core = certificate.toCore() as { __typename: string } & Record<
      string,
      any
    >;
    const account = core.stakeCredential
      ? rewardAddressOf(toCredentialRef(core.stakeCredential), networkId)
      : undefined;
    if (account) refs.accounts.add(account);
    if (core.poolId) refs.pools.add(normalizePoolId(String(core.poolId)));
    if (core.dRep) {
      const drep = drepTargetOf(core.dRep);
      if (!isPredefinedDRep(drep)) refs.dreps.add(drep);
    }
    switch (core.__typename) {
      case Cardano.CertificateType.StakeRegistration:
        refs.registrations.push({
          kind: "account",
          key: account!,
          register: true,
        });
        break;
      case Cardano.CertificateType.Registration:
      case Cardano.CertificateType.StakeRegistrationDelegation:
      case Cardano.CertificateType.VoteRegistrationDelegation:
      case Cardano.CertificateType.StakeVoteRegistrationDelegation:
        refs.registrations.push({
          kind: "account",
          key: account!,
          register: true,
          amount: BigInt(core.deposit),
        });
        break;
      case Cardano.CertificateType.StakeDeregistration:
        refs.registrations.push({
          kind: "account",
          key: account!,
          register: false,
        });
        break;
      case Cardano.CertificateType.Unregistration:
        refs.registrations.push({
          kind: "account",
          key: account!,
          register: false,
          amount: BigInt(core.deposit),
        });
        break;
      case Cardano.CertificateType.PoolRegistration: {
        const poolId = normalizePoolId(String(core.poolParameters.id));
        refs.pools.add(poolId);
        refs.registrations.push({ kind: "pool", key: poolId, register: true });
        break;
      }
      case Cardano.CertificateType.RegisterDelegateRepresentative:
      case Cardano.CertificateType.UnregisterDelegateRepresentative: {
        const drep = drepTargetOf(core.dRepCredential);
        refs.dreps.add(drep);
        refs.registrations.push({
          kind: "drep",
          key: drep,
          register:
            core.__typename ===
            Cardano.CertificateType.RegisterDelegateRepresentative,
          amount: BigInt(core.deposit),
        });
        break;
      }
      case Cardano.CertificateType.UpdateDelegateRepresentative:
        refs.dreps.add(drepTargetOf(core.dRepCredential));
        break;
      case Cardano.CertificateType.AuthorizeCommitteeHot:
      case Cardano.CertificateType.ResignCommitteeCold:
        refs.committeeCold.push(toCredentialRef(core.coldCredential));
        break;
    }
  }

  for (const { voter, votes } of body.votingProcedures()?.toCore() ?? []) {
    const credential = toCredentialRef(voter.credential);
    switch (voter.__typename) {
      case Cardano.VoterType.ccHotKeyHash:
      case Cardano.VoterType.ccHotScriptHash:
        refs.committeeHot.push(credential);
        break;
      case Cardano.VoterType.dRepKeyHash:
      case Cardano.VoterType.dRepScriptHash:
        refs.dreps.add(drepTargetOf(voter.credential));
        break;
      case Cardano.VoterType.stakePoolKeyHash:
        refs.pools.add(credential.hash.toLowerCase());
        break;
    }
    for (const { actionId } of votes)
      refs.votedOn.add(govActionKey(actionId.id, actionId.actionIndex));
  }

  [...(body.proposalProcedures()?.values() ?? [])].forEach(
    (proposal, index) => {
      const core = proposal.toCore();
      const action = core.governanceAction as { __typename: string } & Record<
        string,
        any
      >;
      const kind = GOV_ACTION_KINDS[action.__typename]!;
      const returnAddress = String(core.rewardAccount);
      refs.accounts.add(returnAddress);
      for (const { rewardAccount } of action.withdrawals ?? [])
        refs.accounts.add(String(rewardAccount));
      const update = proposal.getParameterChangeAction()?.protocolParamUpdate();
      refs.proposals.push({
        index,
        kind,
        deposit: core.deposit,
        returnAddress,
        ...(action.governanceActionId && {
          previous: govActionKey(
            action.governanceActionId.id,
            action.governanceActionId.actionIndex,
          ),
        }),
        ...(update && { changedParameters: parameterKeys(update) }),
        addsToCommittee: [...(action.membersToBeAdded ?? [])].map(
          (member: { coldCredential: Cardano.Credential }) =>
            toCredentialRef(member.coldCredential),
        ),
      });
    },
  );

  return refs;
};
