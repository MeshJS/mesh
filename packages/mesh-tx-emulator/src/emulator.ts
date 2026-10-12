// Type-only: erased at compile time, so the CommonJS build still loads Scalus through the
// dynamic import() below rather than a top-level require of an ESM-only package.
import type {
  CardanoInfo,
  DRepRegistration,
  Emulator,
  StakeRegistration,
} from "scalus";

import type {
  Action,
  IFetcher,
  TransactionPrototype,
  UTxO,
} from "@meshsdk/common";
import {
  Cardano,
  deserializeTx,
  fromTxUnspentOutput,
  getTransactionOutputs,
  resolveDataHash,
  transactionPrototypeToHex,
  TransactionUnspentOutput,
} from "@meshsdk/core-cst";
import {
  fromMeshUtxo,
  ScalusEmulator,
  toMeshUtxo,
} from "@meshsdk/scalus-emulator";

import { CquisitorNetwork, TxIssue, validateWithCquisitor } from "./cquisitor";
import { fetchChainState } from "./from-chain";
import {
  applyTransaction,
  cloneLedgerState,
  credentialKey,
  CredentialRef,
  govActionKey,
  GovActionRef,
  GovActionType,
  LedgerAccount,
  LedgerCommitteeMember,
  LedgerDRep,
  LedgerGovAction,
  LedgerPool,
  LedgerState,
  normalizeDRepId,
  normalizePoolId,
} from "./ledger-state";
import { withProtocol } from "./protocol-params";

export type TxEmulatorNetwork = "mainnet" | "preprod" | "preview";

/**
 * What decides whether a transaction is valid:
 * - `"scalus"`: Scalus's ledger rules and Plutus evaluator. Reports the first rule broken. Does
 *   not check governance, nor that pools and DReps delegated to exist.
 * - `"cquisitor"`: cquisitor-lib, which checks every rule against the emulator's state, the
 *   governance rules included, and reports every problem with hints. Needs the optional
 *   `@cardananium/cquisitor-lib` package.
 */
export type TxValidator = "scalus" | "cquisitor";

export type TxEmulatorOptions = {
  validator: TxValidator;
  /** The network whose protocol parameters and slot clock are emulated; mainnet by default */
  network?: TxEmulatorNetwork;
  /** Network, slot clock and protocol parameters to use instead of a network's own */
  info?: CardanoInfo;
  /** UTxOs the ledger starts with */
  utxos?: UTxO[];
  /** Starting slot; the slot containing the current time by default */
  slot?: number;
  /** Registered stake addresses */
  accounts?: {
    rewardAddress: string;
    rewards?: bigint;
    /** The network's stake address deposit by default */
    deposit?: bigint;
    /** The pool delegated to: its bech32 id or key hash */
    pool?: string;
    /** The DRep the vote is delegated to: its id, or `alwaysAbstain` / `alwaysNoConfidence` */
    drep?: string;
  }[];
  /** Registered stake pools */
  pools?: { poolId: string; deposit?: bigint; retirementEpoch?: number }[];
  /** Registered DReps */
  dreps?: { drepId: string; deposit?: bigint }[];
  /** Governance actions proposed earlier */
  govActions?: (GovActionRef & { type: GovActionType; active?: boolean })[];
  /** The last enacted action of each purpose */
  lastEnacted?: (GovActionRef & { type: GovActionType })[];
  /** Constitutional committee members, sitting or proposed (`potential`) */
  committee?: {
    cold: CredentialRef;
    hot?: CredentialRef;
    resigned?: boolean;
    potential?: boolean;
  }[];
  /** The treasury, which a transaction may state */
  treasury?: bigint;
  /**
   * Hash of the constitution's guardrail script, which parameter changes and treasury
   * withdrawals must name; left out when the constitution has none
   */
  guardrailScriptHash?: string;
  /** Datums known to the ledger, as CBOR, e.g. for outputs seeded with only a datum hash */
  datums?: string[];
};

export type FromChainOptions = Omit<TxEmulatorOptions, "info" | "slot"> & {
  /** The network the transaction is for; worked out from the transaction on mainnet */
  network?: TxEmulatorNetwork;
};

/** A transaction as CBOR hex, or as a `TransactionPrototype` to encode first */
export type TxInput = string | TransactionPrototype;

export type RunOptions = {
  /**
   * Whether missing signatures make the transaction invalid; true by default. Leaving them out
   * lets a transaction be checked, or a chain of them played, before anyone signs. Supported by
   * the cquisitor validator only, as Scalus always checks signatures.
   */
  requireSignatures?: boolean;
};

/** The ledger accepted the transaction */
export type TxAccepted = {
  accepted: true;
  txHash: string;
  fee: bigint;
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
  /** Problems that do not invalidate the transaction, e.g. an overpaid fee */
  warnings: TxIssue[];
  /** Script trace logs */
  logs: string[];
};

/** The ledger rejected the transaction, which changed nothing */
export type TxRejected = {
  accepted: false;
  /** Missing only when the bytes are not a transaction at all */
  txHash?: string;
  /** The first problem's rule, e.g. `ValueNotConserved`, `ScriptFailure`, `MissingKeyHashes` */
  rule: string;
  /** The first problem's message */
  message: string;
  /** Every problem found: one with the scalus validator, all of them with cquisitor */
  errors: TxIssue[];
  warnings: TxIssue[];
  /** Script trace logs */
  logs: string[];
};

export type TxResult = TxAccepted | TxRejected;

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
  rule: errors[0]!.rule,
  message: errors[0]!.message,
  errors,
  warnings,
  logs,
});

/** The outputs a transaction creates: its outputs, or its collateral return if it is invalid */
const producedBy = (txHex: string): UTxO[] => {
  const tx = deserializeTx(txHex);
  if (tx.isValid()) return getTransactionOutputs(txHex);
  const collateralReturn = tx.body().collateralReturn();
  if (!collateralReturn) return [];
  return [
    fromTxUnspentOutput(
      TransactionUnspentOutput.fromCore([
        { txId: tx.getId(), index: tx.body().outputs().length },
        collateralReturn.toCore(),
      ]),
    ),
  ];
};

/**
 * A local Cardano ledger to try transactions out on, one at a time or in chains.
 *
 * - `simulate` checks a transaction against the current state and reports what would happen,
 *   changing nothing.
 * - `submit` does the same, and applies an accepted transaction: its UTxOs, and its effects on
 *   stake addresses, pools, DReps, governance actions and the committee. Later transactions
 *   see those changes, so a chain plays out as it would on chain.
 * - `simulateChain` plays a chain of transactions on a copy of the ledger.
 * - `fork` branches the whole ledger, so one setup can be reused across scenarios.
 * - `provider` is the same ledger as a Mesh `IFetcher`, `ISubmitter` and `IEvaluator`, for
 *   building transactions against it.
 *
 * Time moves only when told to. Moving into a new epoch retires pools scheduled to retire;
 * nothing else happens at an epoch boundary: no rewards are paid, no governance actions are
 * ratified or enacted.
 */
export class TxEmulator {
  /** The ledger as a Mesh fetcher, submitter and evaluator */
  readonly provider: ScalusEmulator;

  private constructor(
    readonly validator: TxValidator,
    private readonly network: CquisitorNetwork,
    private readonly lib: typeof import("scalus"),
    readonly emulator: Emulator,
    private readonly state: LedgerState,
  ) {
    this.provider = new ScalusEmulator(emulator);
  }

  /** Create a ledger, without synchronously loading the ESM-only Scalus package */
  static async create(options: TxEmulatorOptions): Promise<TxEmulator> {
    if (options?.validator !== "scalus" && options?.validator !== "cquisitor")
      throw new Error('options.validator must be "scalus" or "cquisitor"');
    const lib = await import("scalus");
    const network = options.network ?? "mainnet";
    const info = options.info ?? lib.CardanoInfo[network]();
    const params = info.protocolParams;

    const state: LedgerState = {
      accounts: new Map(
        (options.accounts ?? []).map((account): [string, LedgerAccount] => [
          account.rewardAddress,
          {
            rewardAddress: account.rewardAddress,
            deposit: account.deposit ?? params.stakeAddressDeposit,
            rewards: account.rewards ?? 0n,
            ...(account.pool && { pool: normalizePoolId(account.pool) }),
            ...(account.drep && {
              drep:
                account.drep === "alwaysAbstain" ||
                account.drep === "alwaysNoConfidence"
                  ? account.drep
                  : normalizeDRepId(account.drep),
            }),
          },
        ]),
      ),
      pools: new Map(
        (options.pools ?? []).map((pool): [string, LedgerPool] => {
          const poolId = normalizePoolId(pool.poolId);
          return [
            poolId,
            {
              poolId,
              deposit: pool.deposit ?? params.stakePoolDeposit,
              ...(pool.retirementEpoch !== undefined && {
                retirementEpoch: pool.retirementEpoch,
              }),
            },
          ];
        }),
      ),
      dreps: new Map(
        (options.dreps ?? []).map((drep): [string, LedgerDRep] => {
          const drepId = normalizeDRepId(drep.drepId);
          return [
            drepId,
            { drepId, deposit: drep.deposit ?? params.dRepDeposit },
          ];
        }),
      ),
      govActions: new Map(
        (options.govActions ?? []).map((action): [string, LedgerGovAction] => [
          govActionKey(action),
          {
            txHash: action.txHash.toLowerCase(),
            index: action.index,
            type: action.type,
            active: action.active ?? true,
          },
        ]),
      ),
      lastEnacted: new Map(
        (options.lastEnacted ?? []).map((action) => [
          action.type,
          { txHash: action.txHash.toLowerCase(), index: action.index },
        ]),
      ),
      committee: new Map(
        (options.committee ?? []).map(
          (member): [string, LedgerCommitteeMember] => [
            credentialKey(member.cold),
            {
              cold: member.cold,
              ...(member.hot && { hot: member.hot }),
              resigned: member.resigned ?? false,
              potential: member.potential ?? false,
            },
          ],
        ),
      ),
      treasury: options.treasury ?? 0n,
      ...(options.guardrailScriptHash && {
        guardrailScriptHash: options.guardrailScriptHash.toLowerCase(),
      }),
    };

    const credentialOf = (rewardAddress: string) => {
      const credential = Cardano.Address.fromString(rewardAddress)
        ?.asReward()
        ?.getPaymentCredential();
      if (!credential)
        throw new Error(`invalid reward address ${rewardAddress}`);
      return {
        credentialType:
          credential.type === Cardano.CredentialType.ScriptHash
            ? ("script" as const)
            : ("key" as const),
        credentialHash: credential.hash.toString(),
      };
    };
    const emulator = lib.Emulator.create(info, {
      utxos: (options.utxos ?? []).map((utxo) => fromMeshUtxo(utxo, lib)),
      ...(options.slot !== undefined && { slot: options.slot }),
      stakeRegistrations: [...state.accounts.values()].map(
        (account): StakeRegistration => ({
          ...credentialOf(account.rewardAddress),
          rewards: account.rewards,
          ...(account.pool && { delegatedTo: account.pool }),
        }),
      ),
      drepRegistrations: [...state.dreps.values()].map(
        (drep): DRepRegistration => {
          const credential = Cardano.DRepID.toCredential(
            Cardano.DRepID(drep.drepId),
          );
          return {
            credentialType:
              credential.type === Cardano.CredentialType.ScriptHash
                ? "script"
                : "key",
            credentialHash: credential.hash.toString(),
            deposit: drep.deposit,
          };
        },
      ),
      datums: (options.datums ?? []).map((datum) => ({
        hash: resolveDataHash(datum, "CBOR"),
        datum,
      })),
    });
    const cquisitorNetwork: CquisitorNetwork =
      options.network ?? (info.network === "mainnet" ? "mainnet" : "preview");
    return new TxEmulator(
      options.validator,
      cquisitorNetwork,
      lib,
      emulator,
      state,
    );
  }

  /**
   * A ledger holding the chain state a transaction reads, fetched from a provider: the outputs
   * it spends and references, the protocol parameters and cost models, the stake addresses it
   * touches and, for the cquisitor validator, the pools, DReps, governance actions and
   * committee members it refers to. Simulating the transaction on it checks it against the
   * chain as it is now.
   *
   * A plain `IFetcher` provides UTxOs, parameters and stake addresses. The rest comes from the
   * optional methods of `IFetcherExtended`, where the provider has them; state given in
   * `options` is added, and takes precedence.
   * @param fetcher The provider to read the chain from
   * @param tx The transaction whose state to gather
   */
  static async fromChain(
    fetcher: IFetcher,
    tx: TxInput,
    options: FromChainOptions,
  ): Promise<TxEmulator> {
    const txHex = typeof tx === "string" ? tx : transactionPrototypeToHex(tx);
    const chain = await fetchChainState(fetcher, txHex, {
      validator: options.validator,
      ...(options.network && { network: options.network }),
    });
    const lib = await import("scalus");
    return TxEmulator.create({
      ...options,
      network: chain.network,
      info: withProtocol(
        lib.CardanoInfo[chain.network](),
        lib,
        chain.protocol,
        chain.costModels,
      ),
      ...(chain.slot !== undefined && { slot: chain.slot }),
      utxos: [...chain.utxos, ...(options.utxos ?? [])],
      accounts: [
        ...chain.accounts
          .filter((account) => account.registered)
          .map((account) => ({
            rewardAddress: account.rewardAddress,
            rewards: BigInt(account.rewards),
            ...(account.deposit && { deposit: BigInt(account.deposit) }),
            ...(account.pool && { pool: account.pool }),
            ...(account.drep && { drep: account.drep }),
          })),
        ...(options.accounts ?? []),
      ],
      pools: [...chain.pools, ...(options.pools ?? [])],
      dreps: [...chain.dreps, ...(options.dreps ?? [])],
      govActions: [...chain.govActions, ...(options.govActions ?? [])],
      lastEnacted: [...chain.lastEnacted, ...(options.lastEnacted ?? [])],
      committee: [...chain.committee, ...(options.committee ?? [])],
      ...((options.treasury ?? chain.treasury) !== undefined && {
        treasury: options.treasury ?? chain.treasury,
      }),
      ...((options.guardrailScriptHash ?? chain.guardrailScriptHash) && {
        guardrailScriptHash:
          options.guardrailScriptHash ?? chain.guardrailScriptHash,
      }),
    });
  }

  /**
   * An independent copy of the whole ledger: UTxOs, stake addresses, pools, DReps, governance
   * actions, the committee and the clock. The copy and this ledger evolve separately from then
   * on.
   */
  fork(): TxEmulator {
    return new TxEmulator(
      this.validator,
      this.network,
      this.lib,
      this.emulator.snapshot(),
      cloneLedgerState(this.state),
    );
  }

  /** Check a transaction against the current state, changing nothing */
  simulate(tx: TxInput, options: RunOptions = {}): Promise<TxResult> {
    return this.run(tx, { ...options, apply: false });
  }

  /** Check a transaction and, if it is accepted, apply it */
  submit(tx: TxInput, options: RunOptions = {}): Promise<TxResult> {
    return this.run(tx, { ...options, apply: true });
  }

  /**
   * Play a chain of transactions on a copy of the ledger, each seeing the effects of those
   * accepted before it. This ledger is left unchanged.
   */
  async simulateChain(
    txs: TxInput[],
    options: RunOptions = {},
  ): Promise<TxResult[]> {
    const fork = this.fork();
    const results: TxResult[] = [];
    for (const tx of txs) results.push(await fork.submit(tx, options));
    return results;
  }

  /** UTxOs in the ledger, all of them or those matching every given criterion */
  utxos(
    filter: { address?: string; txHash?: string; unit?: string } = {},
  ): UTxO[] {
    return this.emulator.getUtxos(filter).map(toMeshUtxo);
  }

  /** A registered stake address */
  account(rewardAddress: string): LedgerAccount | undefined {
    return structuredClone(this.state.accounts.get(rewardAddress));
  }

  /** A registered stake pool, by bech32 id or key hash */
  pool(poolId: string): LedgerPool | undefined {
    return structuredClone(this.state.pools.get(normalizePoolId(poolId)));
  }

  /** A registered DRep, by any of its ids */
  drep(drepId: string): LedgerDRep | undefined {
    return structuredClone(this.state.dreps.get(normalizeDRepId(drepId)));
  }

  /** A governance action proposed in this ledger or given at creation */
  govAction(id: GovActionRef): LedgerGovAction | undefined {
    return structuredClone(this.state.govActions.get(govActionKey(id)));
  }

  /** A constitutional committee member, sitting or proposed, by cold credential */
  committeeMember(cold: CredentialRef): LedgerCommitteeMember | undefined {
    return structuredClone(this.state.committee.get(credentialKey(cold)));
  }

  /** The current slot */
  get slot(): number {
    return this.emulator.getSlot();
  }

  /** The POSIX time in milliseconds at which the current slot starts */
  get time(): number {
    return this.emulator.getTime();
  }

  /** The current epoch, by the network's slot clock */
  get epoch(): number {
    return this.epochOf(this.slot);
  }

  /** Move the clock to a slot */
  setSlot(slot: number): void {
    const from = this.epoch;
    this.emulator.setSlot(slot);
    this.enterEpoch(from);
  }

  /** Move the clock to the slot containing a POSIX time in milliseconds */
  setTime(posixMillis: number): void {
    const from = this.epoch;
    this.emulator.setTime(posixMillis);
    this.enterEpoch(from);
  }

  /** Move the clock forward by a number of slots */
  tick(slots: number): void {
    const from = this.epoch;
    this.emulator.tick(slots);
    this.enterEpoch(from);
  }

  /**
   * Move the clock to the first slot of a later epoch, the next one by default.
   * @returns The slot the clock moved to
   */
  advanceToEpoch(epoch = this.epoch + 1): number {
    if (epoch <= this.epoch)
      throw new Error(
        `epoch ${epoch} is not after the current epoch ${this.epoch}`,
      );
    const { zeroSlot, zeroEpoch, epochLength } =
      this.emulator.getCardanoInfo().slotConfig;
    const slot = zeroSlot + (epoch - zeroEpoch) * epochLength;
    this.setSlot(slot);
    return slot;
  }

  private epochOf(slot: number): number {
    const { zeroSlot, zeroEpoch, epochLength } =
      this.emulator.getCardanoInfo().slotConfig;
    return zeroEpoch + Math.floor((slot - zeroSlot) / epochLength);
  }

  /** Retires the pools due to retire by the current epoch, once the clock passes into it */
  private enterEpoch(from: number): void {
    const epoch = this.epoch;
    if (epoch <= from) return;
    for (const [poolId, pool] of this.state.pools)
      if (pool.retirementEpoch !== undefined && pool.retirementEpoch <= epoch)
        this.state.pools.delete(poolId);
  }

  private async run(
    input: TxInput,
    { apply, requireSignatures = true }: RunOptions & { apply: boolean },
  ): Promise<TxResult> {
    if (!requireSignatures && this.validator === "scalus")
      throw new Error(
        "requireSignatures: false needs the cquisitor validator; Scalus always checks signatures",
      );
    const txHex =
      typeof input === "string" ? input : transactionPrototypeToHex(input);
    let tx: ReturnType<typeof deserializeTx>;
    try {
      tx = deserializeTx(txHex);
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
    const isValid = tx.isValid();
    const spent = (
      (isValid ? body.inputs() : body.collateral())?.values() ?? []
    ).map((input) => ({
      txHash: input.transactionId().toString(),
      outputIndex: Number(input.index()),
    }));
    const consumed = this.emulator.getUtxos({ outRefs: spent }).map(toMeshUtxo);

    let redeemers: Omit<Action, "data">[] = [];
    let warnings: TxIssue[] = [];
    let logs: string[] = [];
    if (this.validator === "scalus") {
      const target = apply ? this.emulator : this.emulator.snapshot();
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
        return rejected(
          txHash,
          [
            {
              rule,
              message: result.error ?? "",
              phase: rule === "ScriptFailure" ? 2 : 1,
            },
          ],
          [],
          logs,
        );
      }
    } else {
      const report = await validateWithCquisitor({
        txHex,
        network: this.network,
        slot: this.slot,
        params: this.emulator.getProtocolParameters(),
        state: this.state,
        findUtxos: (refs) =>
          refs.length === 0
            ? []
            : this.emulator.getUtxos({ outRefs: refs }).map(toMeshUtxo),
      });
      const errors = requireSignatures
        ? report.errors
        : report.errors.filter((e) => e.rule !== "MissingVKeyWitnesses");
      ({ redeemers, warnings, logs } = report);
      if (errors.length > 0) return rejected(txHash, errors, warnings, logs);
    }

    const produced = producedBy(txHex);
    if (apply) {
      if (this.validator === "cquisitor") {
        // cquisitor only validates; the UTxO set is kept in the Scalus ledger, updated here
        for (const outRef of spent) this.emulator.removeUtxo(outRef);
        for (const utxo of produced)
          this.emulator.addUtxo(fromMeshUtxo(utxo, this.lib));
      }
      const params = this.emulator.getProtocolParameters();
      applyTransaction(
        this.state,
        txHex,
        this.emulator.getCardanoInfo().network === "mainnet" ? 1 : 0,
        {
          keyDeposit: params.stakeAddressDeposit,
          poolDeposit: params.stakePoolDeposit,
          drepDeposit: params.dRepDeposit,
        },
      );
    }

    return {
      accepted: true,
      txHash,
      fee: body.fee(),
      isValid,
      redeemers,
      consumed,
      produced,
      warnings,
      logs,
    };
  }
}
