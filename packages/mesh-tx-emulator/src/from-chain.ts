import type {
  GovernanceProposalInfo,
  IFetcher,
  IGovernanceFetcher,
  IStakePoolFetcher,
  Protocol,
  UTxO,
} from "@meshsdk/common";
import { GovernanceActionKind } from "@meshsdk/common";
import { Cardano, deserializeTx } from "@meshsdk/core-cst";

import {
  emptyLedgerState,
  EnactedAction,
  item,
  LedgerAccount,
  LedgerCommitteeMember,
  LedgerGovAction,
  LedgerPool,
  LedgerState,
} from "./ledger-state";
import {
  credentialKey,
  fromMeshCredential,
  GOV_PURPOSES,
  govActionKey,
  isPredefinedDRep,
  normalizeDRepId,
  normalizePoolId,
  purposeOf,
  rewardAddressOf,
  toCredentialRef,
  TxRefs,
  txRefs,
} from "./tx-refs";

export type ChainNetwork = "mainnet" | "preprod" | "preview";

/** The chain state a transaction reads, gathered from providers */
export type ChainSnapshot = {
  network: ChainNetwork;
  protocol: Protocol;
  costModels?: number[][];
  utxos: UTxO[];
  refs: TxRefs;
  state: LedgerState;
};

/** Governance action kinds as providers spell them, without case or separators */
const PROVIDER_KINDS: Record<string, GovernanceActionKind> = {
  parameterchange: GovernanceActionKind.ParameterChangeAction,
  hardforkinitiation: GovernanceActionKind.HardForkInitiationAction,
  treasurywithdrawals: GovernanceActionKind.TreasuryWithdrawalsAction,
  noconfidence: GovernanceActionKind.NoConfidenceAction,
  newcommittee: GovernanceActionKind.UpdateCommitteeAction,
  updatecommittee: GovernanceActionKind.UpdateCommitteeAction,
  newconstitution: GovernanceActionKind.NewConstitutionAction,
  info: GovernanceActionKind.InfoAction,
};

/** `parameter_change`, `ParameterChange` and `ParameterChangeAction` alike */
const kindOf = (governanceType: string): GovernanceActionKind | undefined =>
  PROVIDER_KINDS[
    governanceType
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .replace(/action$/, "")
  ];

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * A provider call that may fail, and what is read from its answer, which may not be readable:
 * the value read, or why there is none
 */
const settle = async <T, R>(
  call: () => Promise<T>,
  read: (answer: T) => R,
): Promise<{ value: R } | { reason: string }> => {
  let answer: T;
  try {
    answer = await call();
  } catch (error) {
    return { reason: `the provider failed: ${messageOf(error)}` };
  }
  try {
    return { value: read(answer) };
  } catch (error) {
    return {
      reason: `the provider's answer could not be read: ${messageOf(error)}`,
    };
  }
};

const implementsAll = <T>(
  fetcher: unknown,
  methods: string[],
): T | undefined =>
  fetcher !== null &&
  typeof fetcher === "object" &&
  methods.every(
    (method) =>
      typeof (fetcher as Record<string, unknown>)[method] === "function",
  )
    ? (fetcher as T)
    : undefined;

const GOVERNANCE_METHODS = [
  "fetchDRepState",
  "fetchCommitteeState",
  "fetchLastEnactedGovernanceActions",
  "fetchTreasury",
  "fetchConstitution",
];

/** The network a transaction is meant for, from its body or its outputs */
const networkOf = (txHex: string, given?: ChainNetwork): ChainNetwork => {
  if (given) return given;
  const body = deserializeTx(txHex).body();
  const networkId =
    body.networkId() ?? body.outputs()[0]?.address().getNetworkId();
  if (networkId === Cardano.NetworkId.Mainnet) return "mainnet";
  throw new Error(
    'the transaction is for a test network: pass network: "preprod" or "preview"',
  );
};

/** The parameters a parameter change sets, from the description a provider gives of it */
const changedParametersOf = (
  proposal: GovernanceProposalInfo,
): string[] | undefined => {
  try {
    const description =
      typeof proposal.governanceDescription === "string"
        ? JSON.parse(proposal.governanceDescription)
        : proposal.governanceDescription;
    const update = description?.contents?.[1];
    return update && typeof update === "object" && !Array.isArray(update)
      ? Object.keys(update)
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether a provider reports an epoch. Some write 0 for a step an action has not taken, and no
 * action was enacted, dropped or expired in epoch 0 of a network the emulator emulates.
 */
const isSet = (epoch: number | null | undefined) =>
  epoch !== null && epoch !== undefined && Number(epoch) > 0;

/** A reward address in the canonical form the ledger state keys stake addresses by */
const canonicalRewardAddress = (rewardAddress: string, networkId: 0 | 1) => {
  const credential = Cardano.Address.fromString(rewardAddress)
    ?.asReward()
    ?.getPaymentCredential();
  if (!credential) throw new Error(`${rewardAddress} is not a reward address`);
  return rewardAddressOf(toCredentialRef(credential), networkId);
};

/**
 * Gathers from providers the chain state a transaction reads: the outputs it spends and
 * references, the protocol parameters and cost models, and the stake addresses, pools, DReps,
 * governance actions, committee, treasury and constitution it touches. The outputs and the
 * protocol parameters are required, and a failure to read them is thrown; any other state a
 * provider cannot report, or reports in a form that cannot be read, is left unknown, for the
 * emulator to report as not checked.
 */
export const fetchChainSnapshot = async (
  txHex: string,
  options: {
    fetcher: IFetcher;
    governance?: IGovernanceFetcher;
    pools?: IStakePoolFetcher;
    network?: ChainNetwork;
  },
): Promise<ChainSnapshot> => {
  const { fetcher } = options;
  const governance =
    options.governance ??
    implementsAll<IGovernanceFetcher>(fetcher, GOVERNANCE_METHODS);
  const pools =
    options.pools ??
    implementsAll<IStakePoolFetcher>(fetcher, ["fetchPoolState"]);
  const network = networkOf(txHex, options.network);
  const networkId = network === "mainnet" ? 1 : 0;
  const refs = txRefs(txHex, networkId);
  const body = deserializeTx(txHex).body();

  const outRefs = [
    ...(body.inputs()?.values() ?? []),
    ...(body.collateral()?.values() ?? []),
    ...(body.referenceInputs()?.values() ?? []),
  ].map((input) => `${input.transactionId()}#${Number(input.index())}`);
  const wanted = new Set(outRefs);

  const state: LedgerState = {
    ...emptyLedgerState(),
    partial: { known: new Set(), reasons: new Map() },
  };
  const known = state.partial!.known;
  const reasons = state.partial!.reasons;
  const unknown = (key: string, reason: string) => reasons.set(key, reason);

  const [utxoLists, protocol, costModels] = await Promise.all([
    Promise.all(
      [...new Set(outRefs.map((ref) => ref.split("#")[0]!))].map((txHash) =>
        fetcher.fetchUTxOs(txHash),
      ),
    ),
    fetcher.fetchProtocolParameters(undefined as unknown as number),
    settle(
      () => fetcher.fetchCostModels(),
      (costModels) => costModels,
    ),
  ]);
  const utxos = utxoLists
    .flat()
    .filter((u) => wanted.has(`${u.input.txHash}#${u.input.outputIndex}`));

  const accountsRead = Promise.all(
    [...refs.accounts].map(async (rewardAddress) => {
      const key = item.account(rewardAddress);
      const result = await settle(
        () => fetcher.fetchAccountInfo(rewardAddress),
        (info): { account?: LedgerAccount; reportsDRep: boolean } =>
          info.active
            ? {
                account: {
                  // A deposit the provider does not report is not known
                  ...(info.deposit !== undefined &&
                    info.deposit !== null && { deposit: BigInt(info.deposit) }),
                  rewards: BigInt(info.rewards),
                  withdrawn: BigInt(info.withdrawals ?? 0),
                  ...(info.poolId && { pool: normalizePoolId(info.poolId) }),
                  ...(info.drep && {
                    drep: isPredefinedDRep(info.drep)
                      ? info.drep
                      : normalizeDRepId(info.drep),
                  }),
                },
                // `null` says it delegates to no DRep; left out, the provider does not tell
                reportsDRep: info.drep !== undefined,
              }
            : { reportsDRep: true },
      );
      if ("reason" in result) return unknown(key, result.reason);
      known.add(key);
      const { account, reportsDRep } = result.value;
      if (!account) return;
      state.accounts.set(rewardAddress, account);
      if (reportsDRep) known.add(item.drepDelegation(rewardAddress));
      else
        unknown(
          item.drepDelegation(rewardAddress),
          "the provider does not report DRep delegations",
        );
    }),
  );

  const poolsRead = Promise.all(
    [...refs.pools].map(async (poolHash) => {
      const key = item.pool(poolHash);
      if (!pools)
        return unknown(key, "the provider does not report stake pools");
      const result = await settle(
        () =>
          pools.fetchPoolState(Cardano.PoolId.fromKeyHash(poolHash as never)),
        (pool): LedgerPool | undefined =>
          pool.registered
            ? {
                ...(pool.deposit !== undefined &&
                  pool.deposit !== null && { deposit: BigInt(pool.deposit) }),
                ...(pool.retirementEpoch !== undefined &&
                  pool.retirementEpoch !== null && {
                    retirementEpoch: Number(pool.retirementEpoch),
                  }),
                ...(pool.rewardAddress && {
                  rewardAddress: canonicalRewardAddress(
                    pool.rewardAddress,
                    networkId,
                  ),
                }),
              }
            : undefined,
      );
      if ("reason" in result) return unknown(key, result.reason);
      known.add(key);
      if (result.value) state.pools.set(poolHash, result.value);
    }),
  );

  const drepsRead = Promise.all(
    [...refs.dreps].map(async (drepId) => {
      const key = item.drep(drepId);
      if (!governance)
        return unknown(key, "the provider does not report governance state");
      const result = await settle(
        () => governance.fetchDRepState(drepId),
        (drep) =>
          drep.registered
            ? {
                ...(drep.deposit !== undefined &&
                  drep.deposit !== null && { deposit: BigInt(drep.deposit) }),
              }
            : undefined,
      );
      if ("reason" in result) return unknown(key, result.reason);
      known.add(key);
      if (result.value) state.dreps.set(drepId, result.value);
    }),
  );

  const actionKeys = new Set([
    ...refs.votedOn,
    ...refs.proposals.flatMap((proposal) =>
      proposal.previous ? [proposal.previous] : [],
    ),
  ]);
  const actionsRead = Promise.all(
    [...actionKeys].map(async (actionKey) => {
      const [txHash, index] = actionKey.split("#") as [string, string];
      const key = item.govAction(actionKey);
      const result = await settle(
        () => fetcher.fetchGovernanceProposal(txHash, Number(index)),
        (proposal): LedgerGovAction | undefined => {
          const kind = kindOf(String(proposal.governanceType ?? ""));
          if (!kind)
            throw new Error(
              `no governance action is of the kind ${JSON.stringify(proposal.governanceType)}`,
            );
          // Enacted and dropped actions have left the ledger
          if (isSet(proposal.enactedEpoch) || isSet(proposal.droppedEpoch))
            return undefined;
          const changed =
            kind === GovernanceActionKind.ParameterChangeAction
              ? changedParametersOf(proposal)
              : undefined;
          return {
            kind,
            ...(isSet(proposal.expiration) && {
              expiresAfter: Number(proposal.expiration) - 1,
            }),
            // An expired action is no longer open to votes, but stays until the ledger removes it
            ...(isSet(proposal.expiredEpoch) && { closed: true }),
            ...(proposal.deposit !== undefined &&
              proposal.deposit !== null && {
                deposit: BigInt(proposal.deposit),
              }),
            ...(proposal.returnAddress && {
              returnAddress: proposal.returnAddress,
            }),
            // Left out when the provider does not describe them
            ...(changed && { changedParameters: changed }),
          };
        },
      );
      if ("reason" in result) return unknown(key, result.reason);
      known.add(key);
      if (result.value)
        state.govActions.set(govActionKey(txHash, Number(index)), result.value);
    }),
  );

  const governanceRead = async () => {
    const needs = {
      lastEnacted: refs.proposals.some((proposal) => purposeOf(proposal.kind)),
      committee: refs.committeeCold.length + refs.committeeHot.length > 0,
      treasury: refs.treasury !== undefined,
      constitution: refs.proposals.some(
        (proposal) =>
          proposal.kind === GovernanceActionKind.ParameterChangeAction ||
          proposal.kind === GovernanceActionKind.TreasuryWithdrawalsAction,
      ),
    };
    const lastEnactedKeys = GOV_PURPOSES.map((purpose) =>
      item.lastEnacted(purpose),
    );
    if (!governance) {
      for (const key of [...lastEnactedKeys, item.committee])
        unknown(key, "the provider does not report governance state");
      return;
    }
    await Promise.all([
      needs.lastEnacted &&
        settle(
          () => governance.fetchLastEnactedGovernanceActions(),
          (actions) =>
            actions.flatMap((action) => {
              const purpose = purposeOf(action.kind);
              return purpose
                ? [
                    [
                      purpose,
                      {
                        txHash: action.transactionId.toLowerCase(),
                        index: Number(action.govActionIndex),
                        kind: action.kind,
                      } satisfies EnactedAction,
                    ] as const,
                  ]
                : [];
            }),
        ).then((result) => {
          if ("reason" in result) {
            for (const key of lastEnactedKeys) unknown(key, result.reason);
            return;
          }
          // Every purpose is known: one the provider names no action of has none enacted
          for (const key of lastEnactedKeys) known.add(key);
          for (const [purpose, action] of result.value)
            state.lastEnacted.set(purpose, action);
        }),
      needs.committee &&
        settle(
          () => governance.fetchCommitteeState(),
          (members) =>
            members.map((member): LedgerCommitteeMember => {
              const cold = fromMeshCredential(member.cold);
              return {
                cold,
                ...(member.hot && { hot: fromMeshCredential(member.hot) }),
                resigned: member.resigned,
                potential: member.potential ?? false,
              };
            }),
        ).then((result) => {
          if ("reason" in result) return unknown(item.committee, result.reason);
          known.add(item.committee);
          for (const member of result.value)
            state.committee.set(credentialKey(member.cold), member);
        }),
      needs.treasury &&
        settle(
          () => governance.fetchTreasury(),
          (treasury) => BigInt(treasury),
        ).then((result) => {
          if ("value" in result) state.treasury = result.value;
        }),
      needs.constitution &&
        settle(
          () => governance.fetchConstitution(),
          (constitution) => ({
            anchor: constitution.anchor,
            ...(constitution.guardrailScriptHash && {
              guardrailScriptHash:
                constitution.guardrailScriptHash.toLowerCase(),
            }),
          }),
        ).then((result) => {
          if ("value" in result) state.constitution = result.value;
        }),
    ]);
  };

  await Promise.all([
    accountsRead,
    poolsRead,
    drepsRead,
    actionsRead,
    governanceRead(),
  ]);

  return {
    network,
    protocol,
    ...("value" in costModels && { costModels: costModels.value }),
    utxos,
    refs,
    state,
  };
};
