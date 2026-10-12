import type {
  AccountState,
  IFetcher,
  IFetcherExtended,
  Protocol,
  UTxO,
} from "@meshsdk/common";
import { GovernanceActionKind } from "@meshsdk/common";
import { Cardano, deserializeTx } from "@meshsdk/core-cst";

import { bytesToHex, CquisitorNetwork, necessaryData } from "./cquisitor";
import { GovActionRef } from "./ledger-state";

/** The ledger state a transaction reads, gathered from a provider */
export type ChainState = {
  network: CquisitorNetwork;
  protocol: Protocol;
  costModels?: number[][];
  slot?: number;
  utxos: UTxO[];
  accounts: AccountState[];
  pools: { poolId: string; deposit?: bigint; retirementEpoch?: number }[];
  dreps: { drepId: string; deposit?: bigint }[];
  govActions: (GovActionRef & {
    type: GovernanceActionKind;
    active: boolean;
  })[];
  lastEnacted: (GovActionRef & { type: GovernanceActionKind })[];
  committee: {
    cold: { type: "key" | "script"; hash: string };
    hot?: { type: "key" | "script"; hash: string };
    resigned?: boolean;
    potential?: boolean;
  }[];
  treasury?: bigint;
  guardrailScriptHash?: string;
};

/** Governance action types as providers name them */
const PROVIDER_KINDS: Record<string, GovernanceActionKind> = {
  parameter_change: GovernanceActionKind.ParameterChangeAction,
  hard_fork_initiation: GovernanceActionKind.HardForkInitiationAction,
  treasury_withdrawals: GovernanceActionKind.TreasuryWithdrawalsAction,
  no_confidence: GovernanceActionKind.NoConfidenceAction,
  new_committee: GovernanceActionKind.UpdateCommitteeAction,
  new_constitution: GovernanceActionKind.NewConstitutionAction,
  info_action: GovernanceActionKind.InfoAction,
};

const extended = (fetcher: IFetcher) => fetcher as IFetcherExtended;

/** Calls an optional method, treating a failure as "not available" */
const attempt = async <T>(call: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await call();
  } catch {
    return undefined;
  }
};

/** The network a transaction is meant for, from its body or its outputs */
const networkOf = (
  tx: ReturnType<typeof deserializeTx>,
  given?: CquisitorNetwork,
): CquisitorNetwork => {
  if (given) return given;
  const output = tx.body().outputs()[0];
  const networkId = tx.body().networkId() ?? output?.address().getNetworkId();
  if (networkId === Cardano.NetworkId.Mainnet) return "mainnet";
  throw new Error(
    'the transaction is for a test network: pass network: "preprod" or "preview"',
  );
};

/**
 * The stake addresses whose state a transaction depends on: those it withdraws from and those
 * its certificates act on
 */
const accountsOf = (
  tx: ReturnType<typeof deserializeTx>,
  network: CquisitorNetwork,
): string[] => {
  const networkId = network === "mainnet" ? 1 : 0;
  const accounts = new Set<string>();
  for (const [rewardAccount] of tx.body().withdrawals() ?? new Map())
    accounts.add(rewardAccount.toString());
  for (const certificate of tx.body().certs()?.values() ?? []) {
    const { stakeCredential } = certificate.toCore() as {
      stakeCredential?: Cardano.Credential;
    };
    if (stakeCredential)
      accounts.add(
        Cardano.RewardAddress.fromCredentials(networkId, stakeCredential)
          .toAddress()
          .toBech32(),
      );
  }
  return [...accounts];
};

/**
 * Gathers from a provider the ledger state a transaction reads: its UTxOs, the protocol
 * parameters, the stake addresses it touches and, for the cquisitor validator, the pools,
 * DReps, governance actions and committee members it refers to. State that only the optional
 * `IFetcherExtended` methods report is gathered when the provider has them, and left out
 * otherwise.
 */
export const fetchChainState = async (
  fetcher: IFetcher,
  txHex: string,
  {
    validator,
    network: given,
  }: { validator: "scalus" | "cquisitor"; network?: CquisitorNetwork },
): Promise<ChainState> => {
  const tx = deserializeTx(txHex);
  const body = tx.body();
  const network = networkOf(tx, given);
  const more = extended(fetcher);
  const needed =
    validator === "cquisitor" ? await necessaryData(txHex, network) : undefined;

  const outRefs = [
    ...(body.inputs()?.values() ?? []),
    ...(body.collateral()?.values() ?? []),
    ...(body.referenceInputs()?.values() ?? []),
  ].map((input) => ({
    txHash: input.transactionId().toString(),
    outputIndex: Number(input.index()),
  }));
  const wanted = new Set(outRefs.map((r) => `${r.txHash}#${r.outputIndex}`));
  const fetchedTxs = await Promise.all(
    [...new Set(outRefs.map((r) => r.txHash))].map(
      async (txHash) => (await attempt(() => fetcher.fetchUTxOs(txHash))) ?? [],
    ),
  );
  const utxos = fetchedTxs
    .flat()
    .filter((u) => wanted.has(`${u.input.txHash}#${u.input.outputIndex}`));

  const [protocol, costModels, slot] = await Promise.all([
    fetcher.fetchProtocolParameters(undefined as unknown as number),
    attempt(() => fetcher.fetchCostModels()),
    more.fetchTipSlot ? attempt(() => more.fetchTipSlot!()) : undefined,
  ]);

  const accounts = await Promise.all(
    (needed?.accounts ?? accountsOf(tx, network)).map(
      async (rewardAddress): Promise<AccountState> => {
        if (more.fetchAccountState) {
          const state = await attempt(() =>
            more.fetchAccountState!(rewardAddress),
          );
          if (state) return state;
        }
        const info = await attempt(() =>
          fetcher.fetchAccountInfo(rewardAddress),
        );
        return {
          rewardAddress,
          registered: info?.active ?? false,
          rewards: info?.rewards ?? "0",
          ...(info?.poolId && { pool: info.poolId }),
        };
      },
    ),
  );

  const pools = more.fetchPoolState
    ? (
        await Promise.all(
          (needed?.pools ?? []).map((poolId) =>
            attempt(() => more.fetchPoolState!(poolId)),
          ),
        )
      )
        .filter((pool) => pool?.registered)
        .map((pool) => ({
          poolId: pool!.poolId,
          ...(pool!.deposit && { deposit: BigInt(pool!.deposit) }),
          ...(pool!.retirementEpoch !== undefined && {
            retirementEpoch: pool!.retirementEpoch,
          }),
        }))
    : [];

  const dreps = more.fetchDRepState
    ? (
        await Promise.all(
          (needed?.dReps ?? []).map((drepId) =>
            attempt(() => more.fetchDRepState!(drepId)),
          ),
        )
      )
        .filter((drep) => drep?.registered)
        .map((drep) => ({
          drepId: drep!.drepId,
          ...(drep!.deposit && { deposit: BigInt(drep!.deposit) }),
        }))
    : [];

  const govActions = (
    await Promise.all(
      (needed?.govActions ?? []).map(async (id) => {
        const txHash = bytesToHex(id.txHash);
        const index = Number(id.index);
        if (more.fetchGovernanceActionState) {
          const action = await attempt(() =>
            more.fetchGovernanceActionState!(txHash, index),
          );
          return (
            action && {
              txHash,
              index,
              type: action.kind,
              active: action.active,
            }
          );
        }
        const proposal = await attempt(() =>
          fetcher.fetchGovernanceProposal(txHash, index),
        );
        const type = proposal && PROVIDER_KINDS[proposal.governanceType];
        if (!proposal || !type) return undefined;
        const closed = [
          proposal.ratifiedEpoch,
          proposal.enactedEpoch,
          proposal.droppedEpoch,
          proposal.expiredEpoch,
        ].some((epoch) => epoch !== null && epoch !== undefined);
        return { txHash, index, type, active: !closed };
      }),
    )
  ).filter((action) => action !== undefined);

  const lastEnacted =
    needed &&
    needed.lastEnactedGovAction.length > 0 &&
    more.fetchLastEnactedGovernanceActions
      ? (
          (await attempt(() => more.fetchLastEnactedGovernanceActions!())) ?? []
        ).map(({ txHash, index, kind }) => ({ txHash, index, type: kind }))
      : [];

  const committee =
    needed &&
    needed.committeeMembersCold.length + needed.committeeMembersHot.length >
      0 &&
    more.fetchCommitteeState
      ? ((await attempt(() => more.fetchCommitteeState!())) ?? [])
      : [];

  const treasury =
    body.currentTreasuryValue() !== undefined && more.fetchTreasury
      ? await attempt(() => more.fetchTreasury!())
      : undefined;

  // Only parameter changes and treasury withdrawals name the guardrail script
  const proposesGuarded = [...(body.proposalProcedures()?.values() ?? [])].some(
    (proposal) => {
      const type = proposal.toCore().governanceAction.__typename;
      return (
        type === Cardano.GovernanceActionType.parameter_change_action ||
        type === Cardano.GovernanceActionType.treasury_withdrawals_action
      );
    },
  );
  const constitution =
    proposesGuarded && more.fetchConstitution
      ? await attempt(() => more.fetchConstitution!())
      : undefined;

  return {
    network,
    protocol,
    ...(costModels && { costModels }),
    ...(slot !== undefined && { slot }),
    utxos,
    accounts,
    pools,
    dreps,
    govActions,
    lastEnacted,
    committee,
    ...(treasury !== undefined && { treasury: BigInt(treasury) }),
    ...(constitution?.guardrailScriptHash && {
      guardrailScriptHash: constitution.guardrailScriptHash,
    }),
  };
};
