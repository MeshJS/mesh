// Type-only: erased at compile time, so the CommonJS build still loads Scalus through the
// dynamic import() below rather than a top-level require of an ESM-only package.
import type {
  CardanoInfo,
  DatumEntry,
  DRepRegistration,
  Emulator,
  ProtocolParams,
  RedeemerBudget,
  StakeRegistration,
  Utxo,
} from "scalus";

import type {
  AccountInfo,
  Action,
  Asset,
  AssetMetadata,
  BlockInfo,
  CommitteeMemberState,
  ConstitutionState,
  DRepState,
  EnactedGovernanceAction,
  GovernanceActionId,
  GovernanceActionKind,
  GovernanceProposalInfo,
  IEvaluator,
  IFetcher,
  IGovernanceFetcher,
  IStakePoolFetcher,
  ISubmitter,
  PoolState,
  Protocol,
  RedeemerTagType,
  ScriptFailure,
  SlotConfig,
  TransactionInfo,
  TransactionPrototype,
  UTxO,
} from "@meshsdk/common";
import {
  ProviderError,
  ScriptEvaluationError,
  TxConfirmTimeoutError,
} from "@meshsdk/common";
import {
  Cardano,
  Crypto,
  deserializeTx,
  fromValue,
  resolveDataHash,
  Serialization,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";
import {
  fromMeshUtxo,
  ScalusEmulator,
  toMeshUtxo,
} from "@meshsdk/scalus-emulator";

import { Assumed, assumedState } from "./assume";
import { TxIssue, validateWithCquisitor } from "./cquisitor";
import { fetchChainSnapshot } from "./from-chain";
import {
  applyTransaction,
  cloneLedgerState,
  emptyLedgerState,
  enterEpoch,
  isKnown,
  item,
  LedgerState,
  unknownReason,
} from "./ledger-state";
import { notCheckedIssues } from "./not-checked";
import {
  govActionLifetime,
  toMeshProtocol,
  withProtocol,
} from "./protocol-params";
import {
  putAccount,
  putCommitteeMember,
  putConstitution,
  putDRep,
  putGovernanceAction,
  putLastEnacted,
  putPool,
  removeAccount,
  removeCommitteeMember,
  removeDRep,
  removeGovernanceAction,
  removePool,
} from "./state-edits";
import {
  bech32PoolId,
  CredentialRef,
  GOV_PURPOSES,
  govActionKey,
  MeshCredential,
  normalizeDRepId,
  normalizePoolId,
  rewardAddressOf,
  toMeshCredential,
  TxRefs,
  txRefs,
} from "./tx-refs";

export type TxEmulatorNetwork = "mainnet" | "preprod" | "preview";

/**
 * What decides whether a transaction is valid:
 * - `"scalus"`: Scalus's ledger rules and Plutus evaluator. Reports the first rule broken. Of
 *   governance, it checks only what needs no governance state.
 * - `"cquisitor"`: cquisitor-lib, which checks the ledger rules against the emulator's state,
 *   governance included, and reports every problem with hints. Needs the optional
 *   `@cardananium/cquisitor-lib` package.
 *
 * Each leaves some rules unchecked; the package README lists them.
 */
export type TxValidator = "scalus" | "cquisitor";

/** A registered stake address */
export type TxEmulatorAccount = {
  rewardAddress: string;
  /** Reward balance, in lovelace; none by default */
  rewards?: string;
  /** Deposit paid, in lovelace; the network's stake address deposit by default */
  deposit?: string;
  /** The pool delegated to, by bech32 id or key hash; `null` for none */
  poolId?: string | null;
  /**
   * The DRep the vote is delegated to: its id, or `alwaysAbstain` / `alwaysNoConfidence`;
   * `null` for none
   */
  drep?: string | null;
};

/** A registered stake pool */
export type TxEmulatorPool = {
  /** Bech32 id or key hash */
  poolId: string;
  /** Deposit paid, in lovelace; the network's pool deposit by default */
  deposit?: string;
  /** The epoch it retires at, if it has announced its retirement; `null` for none */
  retirementEpoch?: number | null;
  /** The stake address its deposit goes back to when it retires */
  rewardAddress?: string;
};

/** A registered DRep */
export type TxEmulatorDRep = {
  /** CIP-105 or CIP-129 id */
  drepId: string;
  /** Deposit paid, in lovelace; the network's DRep deposit by default */
  deposit?: string;
};

/** A governance action proposed earlier */
export type TxEmulatorGovernanceAction = GovernanceActionId & {
  kind: GovernanceActionKind;
  /** Still open to votes; true by default */
  active?: boolean;
  /**
   * For a parameter change: the parameters it changes, by ledger name (`maxTxSize`) or CDDL
   * key (`"3"`). Stake pools vote only on changes to the security group. Left out, which
   * parameters it changes is not known, and a stake pool's vote on it is not checked.
   */
  changedParameters?: string[];
};

/** A constitutional committee member */
export type TxEmulatorCommitteeMember = {
  cold: MeshCredential;
  /** The hot credential the member votes with, once authorised; `null` for none */
  hot?: MeshCredential | null;
  /** False by default */
  resigned?: boolean;
  /**
   * Proposed by an update-committee action not yet enacted, rather than sitting; false by
   * default
   */
  potential?: boolean;
};

export type TxEmulatorOptions = {
  validator: TxValidator;
  /** The network whose protocol parameters and slot clock are emulated; mainnet by default */
  network?: TxEmulatorNetwork;
  /** Protocol parameters replacing the network's own, all or some */
  params?: Partial<Protocol>;
  /** The Plutus V1, V2 and V3 cost models replacing the network's own */
  costModels?: number[][];
  /** UTxOs the ledger starts with */
  utxos?: UTxO[];
  /** Starting slot; the slot containing the current time by default */
  slot?: number;
  /** Registered stake addresses */
  accounts?: TxEmulatorAccount[];
  /** Registered stake pools */
  pools?: TxEmulatorPool[];
  /** Registered DReps */
  dreps?: TxEmulatorDRep[];
  governance?: {
    /** Governance actions proposed earlier */
    actions?: TxEmulatorGovernanceAction[];
    /** The last enacted action of each purpose, which the next proposal of it must follow */
    lastEnacted?: EnactedGovernanceAction[];
    /** Constitutional committee members, sitting or proposed to join */
    committee?: TxEmulatorCommitteeMember[];
    /** In lovelace; when left out, a transaction stating the treasury is taken at its word */
    treasury?: string;
    /** When left out, the guardrail script proposals name is not checked */
    constitution?: ConstitutionState;
  };
  /** Datums known to the ledger, as CBOR, e.g. for outputs seeded with only a datum hash */
  datums?: string[];
};

export type FromChainOptions = {
  validator: TxValidator;
  /** The provider to read the chain from */
  fetcher: IFetcher;
  /** Where governance state is read from; the fetcher, when it implements `IGovernanceFetcher` */
  governance?: IGovernanceFetcher;
  /** Where stake pools are read from; the fetcher, when it implements `IStakePoolFetcher` */
  pools?: IStakePoolFetcher;
  /** The network the transaction is for; read from the transaction when it is for mainnet */
  network?: TxEmulatorNetwork;
};

/** A transaction as CBOR hex, or as a `TransactionPrototype` to encode first */
export type TxLike = string | TransactionPrototype;

export type CheckOptions = {
  /**
   * Whether missing signatures make the transaction invalid; true by default. Leaving them out
   * lets a transaction be checked, or a chain of them played, before anyone signs: missing
   * key witnesses are not reported, and native scripts pass when they would once signed. The
   * fee and the size limit are checked as they will be once the transaction is signed.
   * Supported by the cquisitor validator only, as Scalus always checks signatures.
   */
  requireSignatures?: boolean;
};

/** The ledger accepted the transaction */
export type TxAccepted = {
  accepted: true;
  txHash: string;
  /** In lovelace */
  fee: string;
  /**
   * False for a transaction marked as failing phase-2 validation: the ledger accepts it, but it
   * only forfeits its collateral
   */
  isValid: boolean;
  /** Execution units each redeemer used */
  redeemers: Omit<Action, "data">[];
  /** Outputs the transaction spent: its inputs, or its collateral if it is not valid */
  consumed: UTxO[];
  /** Outputs the transaction created: its outputs, or its collateral return if it is not valid */
  produced: UTxO[];
  /**
   * Problems that do not invalidate the transaction, e.g. an overpaid fee, and the state it
   * depends on that the emulator does not know (rule `NotChecked`)
   */
  warnings: TxIssue[];
  /** Script trace logs */
  logs: string[];
};

/** The ledger rejected the transaction, which changed nothing */
export type TxRejected = {
  accepted: false;
  /** Missing only when the bytes are not a transaction at all */
  txHash?: string;
  /** Every problem found: one with the scalus validator, all of them with cquisitor */
  errors: TxIssue[];
  warnings: TxIssue[];
  /** Script trace logs */
  logs: string[];
};

export type TxResult = TxAccepted | TxRejected;

/**
 * What the search answers for one transaction hash: a transaction applied, or outputs that
 * appeared under the hash without a transaction. Never changed in place, as a ledger shares
 * its records with its forks: a change replaces the record.
 */
type TxRecord = {
  /** The slot, and so the block, it is in */
  readonly slot: number;
  /** Its place among the records made in its slot, from 0 */
  readonly index: number;
} & (
  | {
      readonly applied: true;
      readonly info: Omit<
        TransactionInfo,
        "index" | "block" | "hash" | "slot" | "blockHeight"
      >;
    }
  | {
      readonly applied: false;
      /** The first output that appeared at each output index */
      readonly outputs: readonly Utxo[];
    }
);

/**
 * Thrown by `submitTx` when the ledger rejects the transaction. It is the `ProviderError` a
 * provider throws for a refused submission: `kind` is `"rejected"`, `status` is 400 (the HTTP
 * status a provider answers with; the emulator makes no request), `retryable` is false, as the
 * same bytes are refused again while the state is the same, and `body` is `result`. Tell a
 * refusal by `instanceof TxRejectedError`, or without importing the emulator by
 * `ProviderError.is(error) && error.kind === "rejected"`.
 */
export class TxRejectedError extends ProviderError {
  constructor(readonly result: TxRejected) {
    super(
      `transaction rejected: ${result.errors
        .map((error) => `${error.rule}: ${error.message}`)
        .join("; ")}`,
      { kind: "rejected", status: 400, retryable: false, body: result },
    );
  }
}

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));

/** The blake2b-256 hash of a text, as 64 lower-case hex characters */
const textHash = (text: string): string =>
  Crypto.blake2b.hash<string>(
    Array.from(new TextEncoder().encode(text), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("") as never,
    32,
  );

/**
 * The made-up hash of the block of a slot: there is one block in every slot, and its hash
 * depends on the slot alone
 */
const blockHash = (slot: number): string => slot.toString(16).padStart(64, "0");

/**
 * An output address given as bech32, base58 (Byron) or the hex of its bytes, as the ledger lists
 * it. A reward address is refused: no output can be sent to it
 */
const listedAddress = (address: string): string => {
  let parsed: Cardano.Address | null = null;
  try {
    parsed = Cardano.Address.fromString(address);
  } catch {
    // Not an address in any form
  }
  if (!parsed) throw new Error(`${address} is not an address`);
  const type = parsed.getType();
  if (
    type === Cardano.AddressType.RewardKey ||
    type === Cardano.AddressType.RewardScript
  )
    throw new Error(`${address} is a reward address, not an output address`);
  return parsed.getType() === Cardano.AddressType.Byron
    ? parsed.toBase58()
    : parsed.toBech32();
};

const rejected = (
  txHash: string | undefined,
  errors: TxIssue[],
  warnings: TxIssue[] = [],
  logs: string[] = [],
): TxRejected => ({
  accepted: false,
  ...(txHash !== undefined && { txHash }),
  errors,
  warnings,
  logs,
});

/** An output as a Mesh UTxO, the way the ledger lists it */
const toUtxo = (
  txHash: string,
  outputIndex: number,
  output: Serialization.TransactionOutput,
): UTxO => {
  const address = output.address();
  const datum = output.datum();
  return {
    input: { txHash, outputIndex },
    output: {
      address:
        address.getType() === Cardano.AddressType.Byron
          ? address.toBase58()
          : address.toBech32(),
      amount: fromValue(output.amount()),
      dataHash: datum?.asDataHash()?.toString(),
      plutusData: datum?.asInlineData()?.toCbor(),
      scriptRef: output.scriptRef()?.toCbor(),
    },
  };
};

/** The lovelace UTxOs hold */
const lovelaceOf = (utxos: UTxO[]): bigint =>
  utxos.reduce(
    (sum, { output }) =>
      sum +
      BigInt(
        output.amount.find((asset) => asset.unit === "lovelace")?.quantity ?? 0,
      ),
    0n,
  );

/** The outputs a transaction creates: its outputs, or its collateral return if it is invalid */
const producedBy = (
  tx: Serialization.Transaction,
  isValid: boolean,
): UTxO[] => {
  const txHash = tx.getId().toString();
  const outputs = tx.body().outputs();
  if (isValid)
    return outputs.map((output, index) => toUtxo(txHash, index, output));
  const collateralReturn = tx.body().collateralReturn();
  return collateralReturn
    ? [toUtxo(txHash, outputs.length, collateralReturn)]
    : [];
};

/**
 * Certificates Scalus applies to the stake registrations it holds as the state does: a ledger
 * rebuilt from the state after them would hold the same
 */
const SCALUS_IN_STEP = new Set<string>([
  Cardano.CertificateType.StakeRegistration,
  Cardano.CertificateType.StakeDeregistration,
  Cardano.CertificateType.Registration,
  Cardano.CertificateType.Unregistration,
  Cardano.CertificateType.StakeDelegation,
  Cardano.CertificateType.VoteDelegation,
  Cardano.CertificateType.StakeVoteDelegation,
  Cardano.CertificateType.StakeRegistrationDelegation,
  Cardano.CertificateType.VoteRegistrationDelegation,
  Cardano.CertificateType.StakeVoteRegistrationDelegation,
]);

/**
 * Ledger failures by which a refusal of Scalus's is not taken. Scalus checks these rules against
 * a governance state of its own, which holds only what the transactions it applied itself made:
 * it cannot be given the governance actions and the last enacted ones, the committee members
 * only proposed, or the DRep a stake address delegates its vote to, and it is not given the
 * committee, the constitution and the treasury. Its verdict by them says nothing of the state.
 */
const SCALUS_UNJUDGED = new Set<string>([
  // Votes: the actions voted on, and who may vote on them
  "GovActionsDoNotExist",
  "VotingOnExpiredGovAction",
  "DisallowedVoters",
  "VotersDoNotExist",
  "UnelectedCommitteeVoters",
  // Proposals: the action followed, and the guardrail script
  "InvalidPrevGovActionId",
  "ProposalCantFollow",
  "InvalidGuardrailsScriptHash",
  // Committee certificates
  "ConwayCommitteeIsUnknown",
  "ConwayCommitteeHasPreviouslyResigned",
  // A withdrawal to a key-hash stake address, and the treasury a transaction states
  "ConwayWdrlNotDelegatedToDRep",
  "ConwayTreasuryValueMismatch",
]);

/** The same failures as `submitTx` names them: two have another name there */
const SCALUS_UNJUDGED_REPORTED = new Set<string>([
  ...SCALUS_UNJUDGED,
  "WithdrawalsNotDelegatedToDRep",
  "TreasuryValueMismatch",
]);

/**
 * Every first-phase rule a transaction breaks on a Scalus ledger, by its cardano-ledger name and
 * in the ledger's order, changing nothing. Scalus runs no script once one of them is broken.
 */
const brokenRules = (ledger: Emulator, tx: Uint8Array): string[] => {
  try {
    return ledger.ledgerFailures(tx);
  } catch {
    return [];
  }
};

/** Redeemer tags as Mesh spells them, by the name Scalus gives them */
const SCALUS_TAGS: Record<RedeemerBudget["tag"], RedeemerTagType> = {
  Spend: "SPEND",
  Mint: "MINT",
  Cert: "CERT",
  Reward: "REWARD",
  Voting: "VOTE",
  Proposing: "PROPOSE",
};

/**
 * A script failure of Scalus's evaluator as a `ScriptEvaluationError`: one failure for the
 * redeemer it names, none when it names none; the evaluator's error is the `cause`
 */
const scriptEvaluationError = (error: Error): ScriptEvaluationError => {
  const { redeemer, logs } = error as Error & {
    redeemer?: RedeemerBudget;
    logs?: readonly string[];
  };
  const tag = redeemer && SCALUS_TAGS[redeemer.tag];
  const failures: ScriptFailure[] = tag
    ? [
        {
          tag,
          index: redeemer.index,
          message: error.message,
          logs: [...(logs ?? [])],
          budget: {
            mem: Number(redeemer.budget.memory),
            steps: Number(redeemer.budget.steps),
          },
        },
      ]
    : [];
  return new ScriptEvaluationError(error.message, failures, { cause: error });
};

/** Redeemer tags as Mesh spells them, by their number in a transaction */
const REDEEMER_TAGS: Action["tag"][] = [
  "SPEND",
  "MINT",
  "CERT",
  "REWARD",
  "VOTE",
  "PROPOSE",
];

/**
 * The first redeemer whose script needs more than the units the transaction declares for it, as
 * a message. Scalus evaluates a script without holding it to them; the ledger does not.
 */
const overBudget = (
  tx: Serialization.Transaction,
  redeemers: Omit<Action, "data">[],
): string | undefined => {
  const declared = new Map(
    (tx.witnessSet().redeemers()?.values() ?? []).map((redeemer) => [
      `${REDEEMER_TAGS[redeemer.tag()]}:${redeemer.index()}`,
      redeemer.exUnits(),
    ]),
  );
  for (const { tag, index, budget } of redeemers) {
    const units = declared.get(`${tag}:${index}`);
    if (
      units &&
      (BigInt(budget.mem) > units.mem() || BigInt(budget.steps) > units.steps())
    )
      return `${tag}[${index}] failed: out of budget, the script needs { mem: ${budget.mem}, steps: ${budget.steps} }`;
  }
  return undefined;
};

/**
 * Why the scripts of a transaction do not pass, if they do not: the failure of their evaluation,
 * or a script needing more than the units its redeemer declares
 */
const scriptIssue = (
  tx: Serialization.Transaction,
  redeemers: Omit<Action, "data">[],
  failure: unknown,
): TxIssue | undefined => {
  if (failure === undefined) {
    const message = overBudget(tx, redeemers);
    return message === undefined
      ? undefined
      : { rule: "ScriptFailure", message, phase: 2 };
  }
  const message = failure instanceof Error ? failure.message : String(failure);
  // A script that fails is phase 2; anything else kept the scripts from running at all
  return failure instanceof Error &&
    failure.name === "PlutusScriptEvaluationError"
    ? { rule: "ScriptFailure", message, phase: 2 }
    : { rule: "CollectErrors", message, phase: 1 };
};

const scalusCredential = (credential: CredentialRef) => ({
  credentialType: credential.type,
  credentialHash: credential.hash,
});

const stakeCredentialOf = (rewardAddress: string): CredentialRef => {
  const credential = Cardano.Address.fromString(rewardAddress)
    ?.asReward()
    ?.getPaymentCredential();
  if (!credential) throw new Error(`invalid reward address ${rewardAddress}`);
  return {
    type:
      credential.type === Cardano.CredentialType.ScriptHash ? "script" : "key",
    hash: credential.hash.toString(),
  };
};

/** The stake credential of an address, as its reward address */
const rewardAddressFor = (address: string, networkId: 0 | 1): string => {
  const parsed = Cardano.Address.fromString(address);
  if (parsed?.asReward()) return address;
  const credential = parsed?.asBase()?.getStakeCredential();
  if (!credential) throw new Error(`${address} has no stake credential`);
  return rewardAddressOf(
    {
      type:
        credential.type === Cardano.CredentialType.ScriptHash
          ? "script"
          : "key",
      hash: credential.hash.toString(),
    },
    networkId,
  );
};

/**
 * The CBOR of a pool registration certificate standing for a registered pool. The ledger only
 * needs to know the pool is registered; the parameters themselves are placeholders.
 */
const poolCertificate = (
  poolHash: string,
  rewardAddress: string,
  cost: bigint,
): Uint8Array =>
  hexToBytes(
    Serialization.Certificate.newPoolRegistration(
      new Serialization.PoolRegistration(
        Serialization.PoolParams.fromCore({
          id: Cardano.PoolId.fromKeyHash(poolHash as never),
          rewardAccount: rewardAddress as Cardano.RewardAccount,
          pledge: 0n,
          cost,
          margin: { numerator: 0, denominator: 1 },
          owners: [],
          relays: [],
          vrf: "00".repeat(32) as never,
        }),
      ),
    ).toCbor(),
  );

/**
 * A Scalus ledger holding the UTxOs and the registrations of the state, as Scalus checks
 * registrations itself under the scalus validator. With `assume`, it also holds what a
 * transaction needs of the state that the state does not know.
 */
const scalusLedger = (
  lib: typeof import("scalus"),
  info: CardanoInfo,
  state: LedgerState,
  input: {
    utxos: readonly Utxo[];
    slot?: number;
    datums: readonly DatumEntry[];
    assume?: { refs: TxRefs; assumed: Assumed };
  },
): Emulator => {
  const params = info.protocolParams;
  const networkId = info.network === "mainnet" ? 1 : 0;
  const { refs, assumed } = input.assume ?? {};

  const stakeRegistrations: StakeRegistration[] = [...state.accounts].map(
    ([rewardAddress, account]) => ({
      ...scalusCredential(stakeCredentialOf(rewardAddress)),
      rewards: account.rewards,
      ...(account.pool && { delegatedTo: account.pool }),
    }),
  );
  const poolHashes = [...state.pools.keys()];
  const drepIds = [...state.dreps.keys()];
  if (refs && assumed) {
    for (const rewardAddress of refs.accounts)
      if (
        !isKnown(state, item.account(rewardAddress)) &&
        !assumed.newAccounts.has(rewardAddress)
      )
        stakeRegistrations.push({
          ...scalusCredential(stakeCredentialOf(rewardAddress)),
          rewards: refs.withdrawals.get(rewardAddress) ?? 0n,
        });
    for (const poolHash of refs.pools)
      if (
        !isKnown(state, item.pool(poolHash)) &&
        !assumed.newPools.has(poolHash)
      )
        poolHashes.push(poolHash);
    for (const drepId of refs.dreps)
      if (!isKnown(state, item.drep(drepId)) && !assumed.newDReps.has(drepId))
        drepIds.push(drepId);
  }

  return lib.Emulator.create(info, {
    utxos: input.utxos,
    ...(input.slot !== undefined && { slot: input.slot }),
    stakeRegistrations,
    poolRegistrations: poolHashes.map((poolHash) => ({
      params: poolCertificate(
        poolHash,
        state.pools.get(poolHash)?.rewardAddress ??
          rewardAddressOf({ type: "key", hash: poolHash }, networkId),
        BigInt(JSON.parse(params.toBlockfrostJson()).min_pool_cost),
      ),
    })),
    drepRegistrations: drepIds.map((drepId): DRepRegistration => {
      const credential = Cardano.DRepID.toCredential(Cardano.DRepID(drepId));
      return {
        credentialType:
          credential.type === Cardano.CredentialType.ScriptHash
            ? "script"
            : "key",
        credentialHash: credential.hash.toString(),
        deposit:
          state.dreps.get(drepId)?.deposit ??
          assumed?.deposits.get(drepId) ??
          params.dRepDeposit,
      };
    }),
    datums: input.datums,
  });
};

const unsupported = (method: string) =>
  new Error(`${method} is not supported by TxEmulator`);

/**
 * A local Cardano ledger to try transactions out on, one at a time or in chains.
 *
 * - `simulate` checks a transaction against the current state and reports what would happen,
 *   changing nothing.
 * - `submit` does the same, and applies an accepted transaction: its UTxOs, and its effects on
 *   stake addresses, pools, DReps, governance actions, the committee and the treasury. Later
 *   transactions see those changes, so a chain plays out as it would on chain.
 * - `fork` branches the whole ledger, so one setup can be reused across scenarios.
 * - The emulator is itself a Mesh fetcher, governance and stake pool fetcher, submitter and
 *   evaluator, for building transactions against it and reading its state.
 * - It answers as a provider of a chain: there is a block in every slot, so the tip
 *   (`fetchLatestBlock`) is the current slot and its height is the slot number, and the search
 *   (`fetchTxInfo`) finds every transaction applied, at the slot it was applied in, and the
 *   hash of every output added without a transaction, at the slot it appeared in.
 * - The state can also be changed directly, for what no transaction does here: rewards, which
 *   are not paid, governance outcomes, which are not enacted, funds, parameters.
 *
 * Time moves forward only when told to. An epoch boundary retires pools due to retire, adds the
 * epoch's donations to the treasury, removes expired governance actions, returning their
 * deposits, and clears the hot credentials and resignations of committee members only proposed;
 * no rewards are paid and no governance actions are ratified or enacted.
 */
export class TxEmulator
  implements
    IFetcher,
    IGovernanceFetcher,
    IStakePoolFetcher,
    ISubmitter,
    IEvaluator
{
  /** Transactions are checked and applied one at a time, in the order given */
  private queue: Promise<unknown> = Promise.resolve();
  /** Transactions given to `simulate` or `submit` and not yet settled */
  private pending = 0;
  /** The network, slot clock and protocol parameters */
  private info: CardanoInfo;
  /**
   * Set when the registrations, rewards or protocol parameters Scalus holds differ from the
   * state's: after they change outside a transaction, which Scalus cannot follow in place, and
   * after a transaction Scalus applied in its own way. Its ledger is then rebuilt from the state
   * before it is next used.
   */
  private stale = false;
  /**
   * Stake addresses withdrawn from since Scalus's ledger was last built, whose rewards it holds
   * too high, as it does not take withdrawals off them. Its ledger is rebuilt before it checks a
   * transaction reading one of them, rather than after every withdrawal.
   */
  private withdrawn = new Set<string>();
  /**
   * What the search answers, by transaction hash in lower case. Scalus's own chain cannot say:
   * it neither follows transactions the emulator applies itself nor survives a rebuild.
   */
  private records = new Map<string, TxRecord>();
  /** Whether `records` is shared with a fork, and so copied before it is next changed */
  private recordsShared = false;
  /** The slot the last record was made in, and how many records were made in it */
  private block = { slot: -1, records: 0 };
  /**
   * Where `fund` takes its made-up transaction hashes from: a sequence of its own, which a fork
   * starts anew, and the next counter value in it
   */
  private funding = { sequence: "", counter: 0 };

  private constructor(
    readonly validator: TxValidator,
    readonly network: TxEmulatorNetwork,
    private readonly lib: typeof import("scalus"),
    private current: Emulator,
    private readonly state: LedgerState,
    /** Datums given at creation */
    private readonly seed: { datums: DatumEntry[] },
  ) {
    this.info = current.getCardanoInfo();
  }

  /** Create a ledger, without synchronously loading the ESM-only Scalus package */
  static async create(options: TxEmulatorOptions): Promise<TxEmulator> {
    if (options?.validator !== "scalus" && options?.validator !== "cquisitor")
      throw new Error('options.validator must be "scalus" or "cquisitor"');
    const networkId = (options.network ?? "mainnet") === "mainnet" ? 1 : 0;
    const governance = options.governance ?? {};
    return TxEmulator.open({
      ...options,
      state: (params) => {
        const state = emptyLedgerState();
        for (const account of options.accounts ?? [])
          putAccount(state, account, {
            networkId,
            keyDeposit: params.stakeAddressDeposit,
          });
        for (const pool of options.pools ?? [])
          putPool(state, pool, {
            networkId,
            poolDeposit: params.stakePoolDeposit,
          });
        for (const drep of options.dreps ?? [])
          putDRep(state, drep, params.dRepDeposit);
        for (const action of governance.actions ?? [])
          putGovernanceAction(state, action);
        for (const action of governance.lastEnacted ?? [])
          putLastEnacted(state, action);
        for (const member of governance.committee ?? [])
          putCommitteeMember(state, member);
        if (governance.treasury !== undefined)
          state.treasury = BigInt(governance.treasury);
        if (governance.constitution)
          putConstitution(state, governance.constitution);
        return state;
      },
    });
  }

  /**
   * A ledger holding the chain state a transaction reads, fetched from providers: the outputs
   * it spends and references, the protocol parameters and cost models, and the stake
   * addresses, pools, DReps, governance actions, committee, treasury and constitution it
   * touches. Simulating the transaction on it checks it against the chain as it is now.
   *
   * The outputs and the protocol parameters must be readable. Any other state the providers
   * cannot report is taken to be as the transaction needs it, and reported in the result's
   * warnings with the rule `NotChecked`.
   *
   * Outputs are read with `fetchUTxOs`, which most indexers answer with spent outputs too, so
   * a transaction spending an output already spent on chain is not caught.
   * @param tx The transaction whose state to gather
   */
  static async fromChain(
    tx: TxLike,
    options: FromChainOptions,
  ): Promise<TxEmulator> {
    if (options?.validator !== "scalus" && options?.validator !== "cquisitor")
      throw new Error('options.validator must be "scalus" or "cquisitor"');
    const txHex = typeof tx === "string" ? tx : transactionPrototypeToHex(tx);
    const snapshot = await fetchChainSnapshot(txHex, options);
    return TxEmulator.open({
      validator: options.validator,
      network: snapshot.network,
      params: snapshot.protocol,
      ...(snapshot.costModels && { costModels: snapshot.costModels }),
      utxos: snapshot.utxos,
      state: () => snapshot.state,
    });
  }

  /** Builds the ledger around its state, the UTxOs kept by Scalus */
  private static async open(input: {
    validator: TxValidator;
    network?: TxEmulatorNetwork;
    params?: Partial<Protocol>;
    costModels?: number[][];
    utxos?: UTxO[];
    slot?: number;
    datums?: string[];
    /** The state beyond UTxOs, given the network's protocol parameters */
    state: (params: ProtocolParams) => LedgerState;
  }): Promise<TxEmulator> {
    const lib = await import("scalus");
    const network = input.network ?? "mainnet";
    const info =
      input.params || input.costModels
        ? withProtocol(
            lib.CardanoInfo[network](),
            lib,
            input.params ?? {},
            input.costModels,
          )
        : lib.CardanoInfo[network]();
    const state = input.state(info.protocolParams);
    const seed = {
      datums: (input.datums ?? []).map((datum) => ({
        hash: resolveDataHash(datum, "CBOR"),
        datum,
      })),
    };
    const utxos = (input.utxos ?? []).map((utxo) => fromMeshUtxo(utxo, lib));
    const ledger = scalusLedger(lib, info, state, {
      utxos,
      ...(input.slot !== undefined && { slot: input.slot }),
      ...seed,
    });
    const emulator = new TxEmulator(
      input.validator,
      network,
      lib,
      ledger,
      state,
      seed,
    );
    emulator.recordSeeded(input.utxos ?? [], utxos);
    return emulator;
  }

  /**
   * A new Scalus ledger with the UTxOs and the clock of the current one, and the registrations
   * and parameters of the state; with `assume`, also what a transaction needs of the state that
   * the state does not know
   */
  private rebuild(assume?: { refs: TxRefs; assumed: Assumed }): Emulator {
    const previous = this.current;
    const utxos = previous.getUtxos();
    // The datums of the outputs held, which the datums given at creation may not cover
    const datums = new Map(
      this.seed.datums.map((entry) => [entry.hash, entry.datum]),
    );
    for (const { datumHash } of utxos) {
      const datum =
        datumHash && !datums.has(datumHash)
          ? previous.getDatum(datumHash)
          : undefined;
      if (datumHash && datum) datums.set(datumHash, this.lib.bytesToHex(datum));
    }
    return scalusLedger(this.lib, this.info, this.state, {
      utxos,
      slot: previous.getSlot(),
      datums: [...datums].map(([hash, datum]) => ({ hash, datum })),
      ...(assume && { assume }),
    });
  }

  /** The Scalus ledger, rebuilt first if what it holds differs from the state */
  private get ledger(): Emulator {
    if (this.stale) {
      this.current = this.rebuild();
      this.stale = false;
      this.withdrawn.clear();
    }
    return this.current;
  }

  private get scalus(): ScalusEmulator {
    return new ScalusEmulator(this.ledger);
  }

  private get params(): ProtocolParams {
    return this.info.protocolParams;
  }

  private get networkId(): 0 | 1 {
    return this.network === "mainnet" ? 1 : 0;
  }

  /**
   * An independent copy of the whole ledger: UTxOs, stake addresses, pools, DReps, governance
   * state, the clock and what the search finds. The copy and this ledger evolve separately
   * from then on: what is applied or funded on one is not found on the other. The copy's
   * `fund` never gives a hash this ledger's `fund` gives, and two copies of the same state give
   * the same hashes.
   */
  fork(): TxEmulator {
    const copy = new TxEmulator(
      this.validator,
      this.network,
      this.lib,
      this.ledger.snapshot(),
      cloneLedgerState(this.state),
      this.seed,
    );
    copy.withdrawn = new Set(this.withdrawn);
    copy.records = this.records;
    copy.recordsShared = this.recordsShared = true;
    copy.block = { ...this.block };
    copy.funding = {
      sequence: textHash(
        `TxEmulator fork ${this.funding.sequence} ${this.funding.counter}`,
      ),
      counter: 0,
    };
    return copy;
  }

  /** Check a transaction against the current state, changing nothing */
  simulate(tx: TxLike, options: CheckOptions = {}): Promise<TxResult> {
    return this.enqueue(() => this.run(tx, { ...options, apply: false }));
  }

  /** Check a transaction and, if it is accepted, apply it */
  submit(tx: TxLike, options: CheckOptions = {}): Promise<TxResult> {
    return this.enqueue(() => this.run(tx, { ...options, apply: true }));
  }

  /** UTxOs in the ledger, all of them or those matching every given criterion */
  utxos(
    filter: { address?: string; txHash?: string; unit?: string } = {},
  ): UTxO[] {
    return this.ledger.getUtxos(filter).map(toMeshUtxo);
  }

  /** The current slot */
  get slot(): number {
    return this.ledger.getSlot();
  }

  /** The POSIX time in milliseconds at which the current slot starts */
  get time(): number {
    return this.ledger.getTime();
  }

  /** The current epoch, by the network's slot clock */
  get epoch(): number {
    return this.epochOf(this.slot);
  }

  /**
   * The slot clock of the emulated network, a new object on every read. For mainnet, preprod
   * and preview it equals `SLOT_CONFIG_NETWORK` of `@meshsdk/common`.
   */
  get slotConfig(): SlotConfig {
    const { zeroTime, zeroSlot, slotLength, epochLength, zeroEpoch } =
      this.info.slotConfig;
    return {
      zeroTime,
      zeroSlot,
      slotLength,
      startEpoch: zeroEpoch,
      epochLength,
    };
  }

  /**
   * Move the clock forward: to a slot, to the slot containing a POSIX time in milliseconds, or
   * to the first slot of an epoch. Entering an epoch applies its boundary.
   * @returns The slot the clock moved to
   */
  advanceTo(
    target: { slot: number } | { time: number } | { epoch: number },
  ): number {
    this.assertIdle();
    const { zeroSlot, zeroEpoch, zeroTime, epochLength, slotLength } =
      this.info.slotConfig;
    const slot =
      "slot" in target
        ? target.slot
        : "time" in target
          ? zeroSlot + Math.floor((target.time - zeroTime) / slotLength)
          : zeroSlot + (target.epoch - zeroEpoch) * epochLength;
    if (!Number.isInteger(slot) || slot < this.slot)
      throw new Error(
        `the clock only moves forward: slot ${slot} is before the current slot ${this.slot}`,
      );
    const from = this.epoch;
    this.ledger.setSlot(slot);
    if (this.epoch > from) {
      enterEpoch(this.state, this.epoch);
      // Retirements and refunds change registrations and rewards, which Scalus holds too
      this.stale = true;
    }
    return slot;
  }

  // State changes, made without a transaction. Each changes what it names, and what the ledger
  // keeps consistent with it; none pays or refunds a deposit. What a change sets is known from
  // then on, and checked, in a ledger built with `fromChain` too. The state cannot change while
  // a transaction is being checked: await `simulate` and `submit` first.

  /**
   * Add outputs to the ledger, replacing any at the same input. The search finds their
   * transaction hash as a transaction accepted in the current slot, unless it finds the hash
   * already: a transaction applied keeps its answer, and outputs added under the hash earlier
   * keep theirs, joined by those at output indices it does not list yet.
   */
  addUtxos(utxos: UTxO[]): void {
    this.assertIdle();
    const added = utxos.map((utxo) => fromMeshUtxo(utxo, this.lib));
    for (const utxo of added) this.ledger.addUtxo(utxo);
    this.recordSeeded(utxos, added);
  }

  /**
   * Add an output holding `value` at `address`, with no datum and no script, under a made-up
   * transaction hash, and return it as the ledger lists it, at output index 0. The search finds
   * its hash at the current slot, as for `addUtxos`.
   *
   * The hashes come from a counter, so they are the same on every run; one the ledger has held
   * an output under is passed over. A copy made by `fork` has a sequence of its own.
   * @param address Bech32, base58 for a Byron address, or the hex of the address bytes; the
   * output holds it in the form the ledger lists. Another network's address is accepted.
   * @param value Lovelace (`lovelace`, 0 when left out) and tokens by unit (policy id and asset
   * name in hex); a token of quantity 0 is left out
   * @throws Error for a string that is not an address, a reward address, or a negative quantity
   */
  fund(address: string, value: Record<string, bigint>): UTxO {
    this.assertIdle();
    const amount = [{ unit: "lovelace", quantity: "0" }];
    for (const [unit, quantity] of Object.entries(value)) {
      if (quantity < 0n)
        throw new Error(`the quantity of ${unit} is negative: ${quantity}`);
      if (unit === "lovelace") amount[0]!.quantity = quantity.toString();
      else if (quantity > 0n)
        amount.push({ unit, quantity: quantity.toString() });
    }
    const output = { address: listedAddress(address), amount };
    let txHash: string;
    do {
      txHash = textHash(
        `TxEmulator fund ${this.funding.sequence} ${this.funding.counter}`,
      );
      this.funding.counter += 1;
    } while (this.records.has(txHash));
    this.addUtxos([{ input: { txHash, outputIndex: 0 }, output }]);
    return this.utxos({ txHash })[0]!;
  }

  /** Remove outputs from the ledger; those it does not hold are ignored */
  removeUtxos(outRefs: UTxO["input"][]): void {
    this.assertIdle();
    for (const { txHash, outputIndex } of outRefs)
      this.ledger.removeUtxo({ txHash, outputIndex });
  }

  /**
   * Register a stake address, or change a registered one. Fields left out keep their values, or
   * take their defaults for a new registration; `null` removes a delegation.
   */
  setAccount(account: TxEmulatorAccount): void {
    this.assertIdle();
    putAccount(this.state, account, {
      networkId: this.networkId,
      keyDeposit: this.params.stakeAddressDeposit,
    });
    this.stale = true;
  }

  /** Deregister a stake address, with its rewards and delegations */
  removeAccount(rewardAddress: string): void {
    this.assertIdle();
    removeAccount(this.state, rewardAddress, this.networkId);
    this.stale = true;
  }

  /**
   * Register a stake pool, or change a registered one. Fields left out keep their values, or
   * take their defaults for a new pool; `retirementEpoch: null` cancels a retirement.
   */
  setPool(pool: TxEmulatorPool): void {
    this.assertIdle();
    putPool(this.state, pool, {
      networkId: this.networkId,
      poolDeposit: this.params.stakePoolDeposit,
    });
    this.stale = true;
  }

  /** Remove a stake pool, undelegating the stake delegated to it as its retirement would */
  removePool(poolId: string): void {
    this.assertIdle();
    removePool(this.state, poolId);
    this.stale = true;
  }

  /** Register a DRep, or change the deposit of a registered one */
  setDRep(drep: TxEmulatorDRep): void {
    this.assertIdle();
    putDRep(this.state, drep, this.params.dRepDeposit);
    this.stale = true;
  }

  /** Remove a DRep, undelegating the votes delegated to it as its leaving would */
  removeDRep(drepId: string): void {
    this.assertIdle();
    removeDRep(this.state, drepId);
    this.stale = true;
  }

  /**
   * Add a governance action, or change one: `active: false` closes it to votes. Fields left
   * out keep their values; a new action is open to votes until closed.
   */
  setGovernanceAction(action: TxEmulatorGovernanceAction): void {
    this.assertIdle();
    putGovernanceAction(this.state, action);
  }

  /**
   * Remove a governance action, e.g. one enacted; the actions following it stay. Committee
   * members only it proposed leave with it: elect them with `setCommitteeMember` first.
   */
  removeGovernanceAction(action: GovernanceActionId): void {
    this.assertIdle();
    removeGovernanceAction(this.state, action);
  }

  /**
   * Set the last enacted action of the purpose an action's kind serves, which the next proposal
   * of that purpose must follow
   */
  setLastEnacted(action: EnactedGovernanceAction): void {
    this.assertIdle();
    putLastEnacted(this.state, action);
  }

  /**
   * Add a constitutional committee member, or change one, by cold credential: e.g. elect a
   * proposed member with `potential: false`. Fields left out keep their values; a new member is
   * sitting and has not resigned. `hot: null` removes the hot credential.
   */
  setCommitteeMember(member: TxEmulatorCommitteeMember): void {
    this.assertIdle();
    putCommitteeMember(this.state, member);
  }

  /** Remove a constitutional committee member, by cold credential */
  removeCommitteeMember(cold: MeshCredential): void {
    this.assertIdle();
    removeCommitteeMember(this.state, cold);
  }

  /** Set the treasury, in lovelace */
  setTreasury(lovelace: string): void {
    this.assertIdle();
    this.state.treasury = BigInt(lovelace);
  }

  /** Set the constitution, whose guardrail script proposals must name */
  setConstitution(constitution: ConstitutionState): void {
    this.assertIdle();
    putConstitution(this.state, constitution);
  }

  /**
   * Change protocol parameters; those left out keep their values. Parameters a Mesh `Protocol`
   * does not carry, such as governance deposits, cannot be changed.
   * @param costModels The Plutus V1, V2 and V3 cost models
   */
  setProtocolParameters(
    params: Partial<Protocol>,
    costModels?: number[][],
  ): void {
    this.assertIdle();
    this.info = withProtocol(this.info, this.lib, params, costModels);
    this.stale = true;
  }

  // IFetcher

  async fetchAccountInfo(address: string): Promise<AccountInfo> {
    const rewardAddress = rewardAddressFor(address, this.networkId);
    this.requireKnown(
      item.account(rewardAddress),
      `stake address ${rewardAddress}`,
    );
    const account = this.state.accounts.get(rewardAddress);
    const credential = stakeCredentialOf(rewardAddress);
    let balance = account?.rewards ?? 0n;
    for (const utxo of this.ledger.getUtxos({})) {
      const stake = Cardano.Address.fromString(utxo.address)
        ?.asBase()
        ?.getStakeCredential();
      if (stake && stake.hash.toString() === credential.hash)
        balance += utxo.value.coin;
    }
    return {
      active: account !== undefined,
      ...(account?.pool && { poolId: bech32PoolId(account.pool) }),
      balance: balance.toString(),
      rewards: (account?.rewards ?? 0n).toString(),
      withdrawals: (account?.withdrawn ?? 0n).toString(),
      // Left out while the delegation is not known
      ...(account &&
        isKnown(this.state, item.drepDelegation(rewardAddress)) && {
          drep: account.drep ?? null,
        }),
      ...(account?.deposit !== undefined && {
        deposit: account.deposit.toString(),
      }),
    };
  }

  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    return this.utxos(
      asset === undefined ? { address } : { address, unit: asset },
    );
  }

  async fetchAddressTxs(): Promise<TransactionInfo[]> {
    throw unsupported("fetchAddressTxs");
  }

  async fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]> {
    const holdings = new Map<string, bigint>();
    for (const utxo of this.utxos({ unit: asset }))
      for (const { unit, quantity } of utxo.output.amount)
        if (unit === asset)
          holdings.set(
            utxo.output.address,
            (holdings.get(utxo.output.address) ?? 0n) + BigInt(quantity),
          );
    return [...holdings].map(([address, quantity]) => ({
      address,
      quantity: quantity.toString(),
    }));
  }

  async fetchAssetMetadata(): Promise<AssetMetadata> {
    throw unsupported("fetchAssetMetadata");
  }

  async fetchBlockInfo(): Promise<BlockInfo> {
    throw unsupported("fetchBlockInfo");
  }

  /**
   * The tip: the block of the current slot. There is a block in every slot, so `slot` is the
   * current slot and `height` is the slot number; only `advanceTo` moves them. `hash` is
   * made up from the slot, `previousBlock` is the hash of the slot before, and `time` is the
   * slot's start in POSIX seconds. Not filled, as the emulator does not keep them:
   * `slotLeader`, `operationalCertificate` and `VRFKey` are empty, `size`, `txCount`, `output`
   * and `fees` are 0, `nextBlock` is empty and `confirmations` is 0.
   */
  async fetchLatestBlock(): Promise<BlockInfo> {
    const slot = this.slot;
    const { zeroSlot, zeroEpoch, epochLength } = this.info.slotConfig;
    const epoch = this.epochOf(slot);
    return {
      time: Math.floor(this.time / 1000),
      hash: blockHash(slot),
      slot: String(slot),
      epoch,
      epochSlot: String(slot - (zeroSlot + (epoch - zeroEpoch) * epochLength)),
      slotLeader: "",
      size: 0,
      txCount: 0,
      output: "0",
      fees: "0",
      previousBlock: slot > 0 ? blockHash(slot - 1) : "",
      nextBlock: "",
      confirmations: 0,
      operationalCertificate: "",
      VRFKey: "",
      height: slot,
    };
  }

  async fetchCollectionAssets(): Promise<{
    assets: Asset[];
    next?: string | number | null;
  }> {
    throw unsupported("fetchCollectionAssets");
  }

  /** The protocol parameters transactions are checked against */
  async fetchProtocolParameters(epoch = this.epoch): Promise<Protocol> {
    return toMeshProtocol(this.params, epoch);
  }

  fetchCostModels(): Promise<number[][]> {
    return this.scalus.fetchCostModels();
  }

  /**
   * Find a transaction: one `submit` or `submitTx` applied, marked invalid or not
   * (`validContract`), or the hash of outputs that appeared without a transaction (given to
   * `create`, read by `fromChain`, added by `addUtxos` or `fund`), as a transaction accepted in
   * the slot they appeared in. `slot` and `blockHeight` are the slot it is in, so the tip's
   * `height` less `blockHeight` is the slots passed since; transactions of one slot share a
   * block, `index` being the place in it.
   *
   * For a transaction applied, `inputs` and `outputs` are what it spent and created (its
   * collateral and collateral return when marked invalid), `fees` what it paid (the collateral
   * lost when marked invalid), `deposit` the deposits paid less those taken back. For outputs
   * without a transaction, `outputs` are those that appeared under the hash, and the rest is
   * zero or empty. The answer stays when the outputs are spent or removed, unlike `fetchUTxOs`,
   * which lists those still held. `blockTime` is left out.
   *
   * It answers from the state as it is: await `submit` and `submitTx` first.
   * @throws ProviderError of kind `"notFound"`, status 404 (the HTTP status a provider answers
   * with; the emulator makes no request), for a hash it does not find
   */
  async fetchTxInfo(hash: string): Promise<TransactionInfo> {
    const key = hash.toLowerCase();
    const record = this.records.get(key);
    if (!record)
      throw new ProviderError(`transaction ${key} is not in the ledger`, {
        kind: "notFound",
        status: 404,
        retryable: false,
      });
    const info = record.applied
      ? structuredClone(record.info)
      : {
          fees: "0",
          size: 0,
          deposit: "0",
          invalidBefore: "",
          invalidAfter: "",
          inputs: [],
          outputs: [...record.outputs]
            .sort((a, b) => a.outputIndex - b.outputIndex)
            .map(toMeshUtxo),
          validContract: true,
        };
    return {
      index: record.index,
      block: blockHash(record.slot),
      hash: key,
      slot: String(record.slot),
      blockHeight: record.slot,
      ...info,
    };
  }

  /**
   * Whether a transaction is in a block: `true` at once for every hash `fetchTxInfo` finds,
   * including a transaction marked invalid (read `validContract` from `fetchTxInfo`) and the
   * hash of outputs that appeared without a transaction. Nothing else can apply a transaction
   * meanwhile, so it never waits: for any other hash it rejects at once.
   *
   * It answers from the state as it is: await `submit` and `submitTx` first.
   * @param timeoutMs Only reported in the error; 0, the time waited, when left out
   * @throws TxConfirmTimeoutError for a hash `fetchTxInfo` does not find
   */
  async awaitTransactionConfirmation(
    txHash: string,
    timeoutMs?: number,
  ): Promise<boolean> {
    if (this.records.has(txHash.toLowerCase())) return true;
    throw new TxConfirmTimeoutError(txHash, timeoutMs ?? 0);
  }

  fetchUTxOs(hash: string, index?: number): Promise<UTxO[]> {
    return this.scalus.fetchUTxOs(hash, index);
  }

  async fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    const key = govActionKey(txHash, certIndex);
    this.requireKnown(item.govAction(key), `governance action ${key}`);
    const action = this.state.govActions.get(key);
    if (!action)
      throw new Error(`governance action ${key} is not in the ledger`);
    const { expiresAfter } = action;
    // A closed action is reported as expired, from the current epoch if it has not expired by
    // its lifetime: no later than now, and never 0, which some providers write for "not yet"
    const expiredEpoch =
      expiresAfter !== undefined && this.epoch > expiresAfter
        ? expiresAfter + 1
        : action.closed
          ? Math.max(this.epoch, 1)
          : null;
    return {
      txHash: txHash.toLowerCase(),
      certIndex,
      governanceType: action.kind,
      deposit: Number(action.deposit ?? 0),
      returnAddress: action.returnAddress ?? "",
      governanceDescription: JSON.stringify({
        tag: action.kind,
        // The parameters a parameter change sets, when known, as the ledger describes them
        contents: action.changedParameters
          ? [
              null,
              Object.fromEntries(
                action.changedParameters.map((name) => [name, null]),
              ),
            ]
          : [null],
      }),
      ratifiedEpoch: null as never,
      enactedEpoch: null as never,
      droppedEpoch: null as never,
      expiredEpoch: expiredEpoch as never,
      expiration: (expiresAfter !== undefined
        ? expiresAfter + 1
        : null) as never,
      metadata: {},
    };
  }

  async get(): Promise<any> {
    throw unsupported("get");
  }

  // IGovernanceFetcher

  async fetchDRepState(drepId: string): Promise<DRepState> {
    const id = normalizeDRepId(drepId);
    this.requireKnown(item.drep(id), `DRep ${id}`);
    const drep = this.state.dreps.get(id);
    return {
      drepId: id,
      registered: drep !== undefined,
      ...(drep?.deposit !== undefined && { deposit: drep.deposit.toString() }),
    };
  }

  async fetchCommitteeState(): Promise<CommitteeMemberState[]> {
    this.requireKnown(item.committee, "the constitutional committee");
    return [...this.state.committee.values()].map((member) => ({
      cold: toMeshCredential(member.cold),
      ...(member.hot && { hot: toMeshCredential(member.hot) }),
      resigned: member.resigned,
      ...(member.potential && { potential: true }),
    }));
  }

  async fetchLastEnactedGovernanceActions(): Promise<
    EnactedGovernanceAction[]
  > {
    for (const purpose of GOV_PURPOSES)
      this.requireKnown(
        item.lastEnacted(purpose),
        `the last enacted action of the ${purpose} purpose`,
      );
    return [...this.state.lastEnacted.values()].map((action) => ({
      transactionId: action.txHash,
      govActionIndex: action.index,
      kind: action.kind,
    }));
  }

  async fetchTreasury(): Promise<string> {
    if (this.state.treasury === undefined)
      throw new Error("the treasury is not known");
    return this.state.treasury.toString();
  }

  async fetchConstitution(): Promise<ConstitutionState> {
    if (!this.state.constitution)
      throw new Error("the constitution is not known");
    return structuredClone(this.state.constitution);
  }

  // IStakePoolFetcher

  async fetchPoolState(poolId: string): Promise<PoolState> {
    const hash = normalizePoolId(poolId);
    this.requireKnown(item.pool(hash), `pool ${bech32PoolId(hash)}`);
    const pool = this.state.pools.get(hash);
    return {
      poolId: bech32PoolId(hash),
      registered: pool !== undefined,
      ...(pool?.deposit !== undefined && { deposit: pool.deposit.toString() }),
      ...(pool?.retirementEpoch !== undefined && {
        retirementEpoch: pool.retirementEpoch,
      }),
      ...(pool?.rewardAddress && { rewardAddress: pool.rewardAddress }),
    };
  }

  // ISubmitter

  /**
   * Check a transaction and, if it is accepted, apply it.
   * @throws TxRejectedError if the ledger rejects it
   */
  async submitTx(tx: string): Promise<string> {
    const result = await this.submit(tx);
    if (!result.accepted) throw new TxRejectedError(result);
    return result.txHash;
  }

  // IEvaluator

  /**
   * Evaluates against its own ledger, so a builder hands it every UTxO it knows for the inputs,
   * on the ledger or not
   */
  readonly acceptsKnownUtxos = true;

  /**
   * The execution units each redeemer's script uses, evaluated by Scalus against the ledger.
   * @throws ScriptEvaluationError when a script fails, naming the redeemer whose script failed
   * @throws Error for any other failure, e.g. an input the ledger does not hold
   */
  async evaluateTx(
    tx: string,
    additionalUtxos?: UTxO[],
    additionalTxs?: string[],
  ): Promise<Omit<Action, "data">[]> {
    try {
      return await this.scalus.evaluateTx(tx, additionalUtxos, additionalTxs);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "PlutusScriptEvaluationError"
      )
        throw scriptEvaluationError(error);
      throw error;
    }
  }

  private requireKnown(key: string, subject: string) {
    if (!isKnown(this.state, key))
      throw new Error(
        `${subject} is not known: ${unknownReason(this.state, key)}`,
      );
  }

  /** The place of the next record made in a slot among the records of that slot */
  private nextIndex(slot: number): number {
    if (this.block.slot !== slot) this.block = { slot, records: 0 };
    return this.block.records++;
  }

  /**
   * Record outputs that appeared without a transaction, at the current slot: a hash without a
   * record gets one; a record of such outputs gets those at output indices it does not list;
   * the record of a transaction applied is left as it is
   * @param given The outputs as given, read here rather than Scalus's copies, as reading those
   * calls into Scalus
   * @param added Scalus's copies, in the same order, which the record keeps
   */
  private recordSeeded(given: readonly UTxO[], added: readonly Utxo[]): void {
    if (given.length === 0) return;
    const byHash = new Map<string, Utxo[]>();
    // The output indices of each hash given more than once
    const indices = new Map<string, Set<number>>();
    given.forEach(({ input }, position) => {
      const hash = input.txHash.toLowerCase();
      const outputs = byHash.get(hash);
      if (!outputs) {
        byHash.set(hash, [added[position]!]);
        return;
      }
      let seen = indices.get(hash);
      if (!seen) indices.set(hash, (seen = new Set([outputs[0]!.outputIndex])));
      if (!seen.has(input.outputIndex)) {
        seen.add(input.outputIndex);
        outputs.push(added[position]!);
      }
    });
    const slot = this.slot;
    for (const [hash, outputs] of byHash) {
      const record = this.records.get(hash);
      if (!record)
        this.setRecord(hash, {
          slot,
          index: this.nextIndex(slot),
          applied: false,
          outputs,
        });
      else if (!record.applied) {
        const listed = new Set(record.outputs.map((u) => u.outputIndex));
        const joining = outputs.filter((u) => !listed.has(u.outputIndex));
        if (joining.length > 0)
          this.setRecord(hash, {
            ...record,
            outputs: [...record.outputs, ...joining],
          });
      }
    }
  }

  /** Make or replace the record of a hash, in this ledger alone */
  private setRecord(hash: string, record: TxRecord): void {
    if (this.recordsShared) {
      this.records = new Map(this.records);
      this.recordsShared = false;
    }
    this.records.set(hash, record);
  }

  private epochOf(slot: number): number {
    const { zeroSlot, zeroEpoch, epochLength } = this.info.slotConfig;
    return zeroEpoch + Math.floor((slot - zeroSlot) / epochLength);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.pending += 1;
    const result = this.queue.then(task).finally(() => {
      this.pending -= 1;
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  /**
   * Take the outputs a transaction spent out of a Scalus ledger that did not apply it, and add
   * those it created
   */
  private settle(
    ledger: Emulator,
    spent: UTxO["input"][],
    produced: UTxO[],
  ): void {
    for (const outRef of spent) ledger.removeUtxo(outRef);
    for (const utxo of produced) ledger.addUtxo(fromMeshUtxo(utxo, this.lib));
  }

  /** A transaction being checked reads the state throughout, so it must not change meanwhile */
  private assertIdle(): void {
    if (this.pending > 0)
      throw new Error(
        "a transaction is still being checked: await simulate and submit before changing the ledger",
      );
  }

  private async run(
    input: TxLike,
    { apply, requireSignatures = true }: CheckOptions & { apply: boolean },
  ): Promise<TxResult> {
    if (!requireSignatures && this.validator === "scalus")
      throw new Error(
        "requireSignatures: false needs the cquisitor validator; Scalus always checks signatures",
      );
    let txHex: string;
    let tx: Serialization.Transaction;
    let refs: TxRefs;
    try {
      txHex =
        typeof input === "string" ? input : transactionPrototypeToHex(input);
      tx = deserializeTx(txHex);
      refs = txRefs(txHex, this.networkId);
    } catch (error) {
      return rejected(undefined, [
        {
          rule: "InvalidTransaction",
          message: error instanceof Error ? error.message : String(error),
          phase: 1,
        },
      ]);
    }
    const txHash = tx.getId().toString();
    const body = tx.body();
    const { isValid } = refs;
    const spent = (
      (isValid ? body.inputs() : body.collateral())?.values() ?? []
    ).map((input) => ({
      txHash: input.transactionId().toString(),
      outputIndex: Number(input.index()),
    }));
    const consumed = this.ledger.getUtxos({ outRefs: spent }).map(toMeshUtxo);
    const produced = producedBy(tx, isValid);
    const slot = this.slot;
    const notChecked = notCheckedIssues(this.state, refs);
    const { params } = this;
    const assumed = assumedState(this.state, refs, {
      keyDeposit: params.stakeAddressDeposit,
      poolDeposit: params.stakePoolDeposit,
      coinIn: lovelaceOf(consumed),
      coinOut: lovelaceOf(produced) + body.fee(),
    });

    let redeemers: Omit<Action, "data">[] = [];
    let warnings: TxIssue[];
    let logs: string[];
    let resync = false;
    if (this.validator === "scalus") {
      // What the transaction needs of state the ledger does not know is registered with Scalus
      // for it alone, on a ledger of its own
      const assuming =
        assumed.deposits.size > 0 ||
        [...refs.accounts].some(
          (rewardAddress) => !isKnown(this.state, item.account(rewardAddress)),
        ) ||
        [...refs.pools].some(
          (poolHash) => !isKnown(this.state, item.pool(poolHash)),
        ) ||
        [...refs.dreps].some(
          (drepId) => !isKnown(this.state, item.drep(drepId)),
        );
      if ([...refs.accounts].some((account) => this.withdrawn.has(account)))
        this.stale = true;
      const target = assuming
        ? this.rebuild({ refs, assumed })
        : apply
          ? this.ledger
          : this.ledger.snapshot();
      // Budgets are evaluated while the inputs are still in the ledger. A script failure is
      // left for the submission to report, with its rule and logs.
      let scriptFailure: unknown;
      if (isValid && (tx.witnessSet().redeemers()?.size() ?? 0) > 0) {
        try {
          redeemers = await new ScalusEmulator(target).evaluateTx(txHex);
        } catch (error) {
          redeemers = [];
          scriptFailure = error;
        }
      }
      const bytes = hexToBytes(txHex);
      const result = target.submitTx(bytes);
      logs = result.logs;
      if (!result.isSuccess) {
        const rule = result.errorRule ?? "Unknown";
        const message = result.error ?? "";
        // Scalus reports one rule broken; these are all of them. The rules not taken are not
        // applied to a transaction marked invalid, so it breaks none of them.
        const broken = isValid ? brokenRules(target, bytes) : [];
        const judged = broken.filter(
          (failure) => !SCALUS_UNJUDGED.has(failure),
        );
        if (broken.length === 0 || judged.length > 0) {
          // The rule Scalus reports, unless that is one not taken: then another the
          // transaction breaks, which Scalus lists without describing it
          if (judged.length > 0 && SCALUS_UNJUDGED_REPORTED.has(rule))
            return rejected(
              txHash,
              [
                {
                  rule: judged[0]!,
                  message: `Scalus lists this rule as broken, and describes only ${rule}, which is not checked`,
                  phase: 1,
                },
              ],
              notChecked,
              logs,
            );
          // Scalus names native and Plutus script failures alike; only Plutus is phase 2
          const phase =
            rule === "ScriptFailure" && !/native script/i.test(message) ? 2 : 1;
          return rejected(txHash, [{ rule, message, phase }], notChecked, logs);
        }
        // Only rules not taken are broken, so nothing but the scripts is left to check, which
        // Scalus did not run
        const issue = scriptIssue(tx, redeemers, scriptFailure);
        if (issue)
          return rejected(
            txHash,
            [issue],
            notChecked,
            (scriptFailure as { logs?: string[] } | undefined)?.logs ?? [],
          );
        if (apply) this.settle(target, spent, produced);
      }
      warnings = notChecked;
      if (apply) this.current = target;
      // Scalus applies some transactions in its own way: it applies the certificates of a
      // transaction marked invalid, and some certificates otherwise than the state. Nor must
      // what was assumed for this one outlive it, and one accepted against Scalus's refusal
      // left its registrations as they were. Its ledger is rebuilt from the state then.
      // It does not take withdrawals off the rewards it holds either, which matters only to a
      // later transaction reading the stake address.
      resync =
        assuming ||
        !result.isSuccess ||
        !isValid ||
        (body.certs()?.values() ?? []).some(
          (certificate) =>
            !SCALUS_IN_STEP.has(
              (certificate.toCore() as { __typename: string }).__typename,
            ),
        );
      if (apply && !resync)
        for (const rewardAddress of refs.withdrawals.keys())
          this.withdrawn.add(rewardAddress);
    } else {
      const report = await validateWithCquisitor({
        txHex,
        network: this.network,
        slot: this.slot,
        epoch: this.epoch,
        params,
        state: this.state,
        refs,
        assumed,
        requireSignatures,
        findUtxos: (outRefs) =>
          outRefs.length === 0
            ? []
            : this.ledger.getUtxos({ outRefs }).map(toMeshUtxo),
      });
      logs = report.logs;
      if (report.errors.length > 0)
        return rejected(
          txHash,
          report.errors,
          [...report.warnings, ...notChecked],
          logs,
        );
      redeemers = report.redeemers;
      warnings = [...report.warnings, ...notChecked];
      // cquisitor only validates; the UTxO set is kept in the Scalus ledger, updated here
      if (apply) this.settle(this.ledger, spent, produced);
    }

    if (apply) {
      applyTransaction(this.state, txHex, refs, {
        networkId: this.networkId,
        epoch: this.epoch,
        keyDeposit: params.stakeAddressDeposit,
        poolDeposit: params.stakePoolDeposit,
        govActionLifetime: govActionLifetime(params),
        newPools: assumed.newPools,
      });
      // Only once the state holds the transaction's effects
      if (resync) this.stale = true;
      const fee = body.fee();
      const withdrawn = [...refs.withdrawals.values()].reduce(
        (sum, amount) => sum + amount,
        0n,
      );
      this.setRecord(txHash, {
        slot,
        index: this.nextIndex(slot),
        applied: true,
        info: {
          // A transaction marked invalid pays its collateral, not its fee, and no deposits
          fees: (isValid
            ? fee
            : lovelaceOf(consumed) - lovelaceOf(produced)
          ).toString(),
          size: txHex.length / 2,
          deposit: (isValid
            ? lovelaceOf(consumed) +
              withdrawn -
              lovelaceOf(produced) -
              fee -
              (refs.donation ?? 0n)
            : 0n
          ).toString(),
          invalidBefore: body.validityStartInterval()?.toString() ?? "",
          invalidAfter: body.ttl()?.toString() ?? "",
          inputs: structuredClone(consumed),
          outputs: structuredClone(produced),
          validContract: isValid,
        },
      });
    }

    return {
      accepted: true,
      txHash,
      fee: body.fee().toString(),
      isValid,
      redeemers,
      consumed,
      produced,
      warnings,
      logs,
    };
  }
}
