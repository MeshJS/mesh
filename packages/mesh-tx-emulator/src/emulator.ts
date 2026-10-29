// Type-only: erased at compile time, so the CommonJS build still loads Scalus through the
// dynamic import() below rather than a top-level require of an ESM-only package.
import type {
  CardanoInfo,
  DatumEntry,
  DRepRegistration,
  Emulator,
  PoolRegistration,
  ProtocolParams,
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
  TransactionInfo,
  TransactionPrototype,
  UTxO,
} from "@meshsdk/common";
import {
  Cardano,
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
 * - `"scalus"`: Scalus's ledger rules and Plutus evaluator. Reports the first rule broken. Does
 *   not check governance, nor that pools and DReps delegated to exist.
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

/** Thrown by `submitTx` when the ledger rejects the transaction */
export class TxRejectedError extends Error {
  constructor(readonly result: TxRejected) {
    super(
      `transaction rejected: ${result.errors
        .map((error) => `${error.rule}: ${error.message}`)
        .join("; ")}`,
    );
    this.name = "TxRejectedError";
  }
}

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));

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
    poolRegistrations: poolHashes.map((poolHash): PoolRegistration => ({
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
 * - The state can also be changed directly, for what no transaction does here: rewards, which
 *   are not paid, governance outcomes, which are not enacted, funds, parameters.
 *
 * Time moves forward only when told to. An epoch boundary retires pools due to retire, adds the
 * epoch's donations to the treasury and removes expired governance actions, returning their
 * deposits; no rewards are paid and no governance actions are ratified or enacted.
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
    const ledger = scalusLedger(lib, info, state, {
      utxos: (input.utxos ?? []).map((utxo) => fromMeshUtxo(utxo, lib)),
      ...(input.slot !== undefined && { slot: input.slot }),
      ...seed,
    });
    return new TxEmulator(input.validator, network, lib, ledger, state, seed);
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
   * state and the clock. The copy and this ledger evolve separately from then on.
   */
  fork(): TxEmulator {
    return new TxEmulator(
      this.validator,
      this.network,
      this.lib,
      this.ledger.snapshot(),
      cloneLedgerState(this.state),
      this.seed,
    );
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

  /** Add outputs to the ledger, replacing any at the same input */
  addUtxos(utxos: UTxO[]): void {
    this.assertIdle();
    const added = utxos.map((utxo) => fromMeshUtxo(utxo, this.lib));
    for (const utxo of added) this.ledger.addUtxo(utxo);
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

  async fetchTxInfo(): Promise<TransactionInfo> {
    throw unsupported("fetchTxInfo");
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

  evaluateTx(
    tx: string,
    additionalUtxos?: UTxO[],
    additionalTxs?: string[],
  ): Promise<Omit<Action, "data">[]> {
    return this.scalus.evaluateTx(tx, additionalUtxos, additionalTxs);
  }

  private requireKnown(key: string, subject: string) {
    if (!isKnown(this.state, key))
      throw new Error(
        `${subject} is not known: ${unknownReason(this.state, key)}`,
      );
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
      const target = assuming
        ? this.rebuild({ refs, assumed })
        : apply
          ? this.ledger
          : this.ledger.snapshot();
      // Budgets are evaluated while the inputs are still in the ledger. A script failure is
      // left for the submission to report, with its rule and logs.
      if (isValid && (tx.witnessSet().redeemers()?.size() ?? 0) > 0) {
        try {
          redeemers = await new ScalusEmulator(target).evaluateTx(txHex);
        } catch {
          redeemers = [];
        }
      }
      const result = target.submitTx(hexToBytes(txHex));
      logs = result.logs;
      if (!result.isSuccess) {
        const rule = result.errorRule ?? "Unknown";
        const message = result.error ?? "";
        // Scalus names native and Plutus script failures alike; only Plutus is phase 2
        const phase =
          rule === "ScriptFailure" && !/native script/i.test(message) ? 2 : 1;
        return rejected(txHash, [{ rule, message, phase }], notChecked, logs);
      }
      warnings = notChecked;
      if (apply) this.current = target;
      // Scalus applies some transactions in its own way: it does not take withdrawals off the
      // rewards it holds, and applies the certificates of a transaction marked invalid. Nor must
      // what was assumed for this one outlive it. Its ledger is rebuilt from the state then.
      resync =
        assuming ||
        !isValid ||
        refs.withdrawals.size > 0 ||
        (body.certs()?.size() ?? 0) > 0;
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
      if (apply) {
        // cquisitor only validates; the UTxO set is kept in the Scalus ledger, updated here
        for (const outRef of spent) this.ledger.removeUtxo(outRef);
        for (const utxo of produced)
          this.ledger.addUtxo(fromMeshUtxo(utxo, this.lib));
      }
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
