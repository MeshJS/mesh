// Type-only: erased at compile time, so the CommonJS build still loads Scalus through the
// dynamic import() below rather than a top-level require of an ESM-only package.
import type {
  CardanoInfo,
  DRepRegistration,
  Emulator,
  StakeRegistration,
} from "scalus";

import type { Action, TransactionPrototype, UTxO } from "@meshsdk/common";
import {
  Cardano,
  deserializeTx,
  resolveDataHash,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";
import {
  fromMeshUtxo,
  ScalusEmulator,
  toMeshUtxo,
} from "@meshsdk/scalus-emulator";

export type TxEmulatorNetwork = "preview" | "preprod" | "mainnet";

export type TxEmulatorOptions = {
  /** The network whose protocol parameters and slot clock are emulated; mainnet by default */
  network?: TxEmulatorNetwork;
  /** Network, slot clock and protocol parameters to use instead of a network's own */
  info?: CardanoInfo;
  /** UTxOs the ledger starts with */
  utxos?: UTxO[];
  /** Starting slot; the slot containing the current time by default */
  slot?: number;
  /** Stake addresses already registered, with their rewards and the pool they delegate to */
  stakeRegistrations?: {
    rewardAddress: string;
    rewards?: bigint;
    /** The pool id in bech32, or its key hash */
    pool?: string;
  }[];
  /** DReps already registered */
  drepRegistrations?: {
    /** The DRep id in bech32 (CIP-105 or CIP-129) */
    drepId: string;
    /** The deposit held; the network's DRep deposit by default */
    deposit?: bigint;
  }[];
  /** Datums known to the ledger, as CBOR, e.g. for outputs seeded with only a datum hash */
  datums?: string[];
};

/** A transaction as CBOR hex, or as a `TransactionPrototype` to encode first */
export type TxInput = string | TransactionPrototype;

/** The ledger accepted the transaction */
export type TxAccepted = {
  accepted: true;
  txHash: string;
  fee: bigint;
  /**
   * False for a transaction marked as failing phase-2 validation: the ledger accepts it, but
   * it only forfeits its collateral
   */
  isValid: boolean;
  /** Execution units each redeemer used, as evaluated against the ledger */
  redeemers: Omit<Action, "data">[];
  /** Outputs the transaction spent: its inputs, or its collateral if it is not valid */
  consumed: UTxO[];
  /** Outputs the transaction created: its outputs, or its collateral return if it is not valid */
  produced: UTxO[];
  /** Script trace logs */
  logs: string[];
};

/** The ledger rejected the transaction, which changed nothing */
export type TxRejected = {
  accepted: false;
  /** Missing only when the bytes are not a transaction at all */
  txHash?: string;
  /**
   * The ledger rule that rejected the transaction, stable enough to branch or assert on:
   * `UtxoNotAvailable`, `TransactionExpired`, `ValueNotConserved`, `ScriptFailure`,
   * `InvalidTransaction`, or the ledger's own rule name (`FeesOk`, `MissingKeyHashes`, ...)
   */
  rule: string;
  message: string;
  /** Script trace logs */
  logs: string[];
};

export type TxResult = TxAccepted | TxRejected;

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));

/** The stake credential of a reward address, as the ledger seeding expects it */
const stakeCredentialOf = (rewardAddress: string) => {
  const credential = Cardano.Address.fromString(rewardAddress)
    ?.asReward()
    ?.getPaymentCredential();
  if (!credential) throw new Error(`invalid reward address ${rewardAddress}`);
  return {
    credentialType:
      credential.type === Cardano.CredentialType.ScriptHash
        ? ("script" as const)
        : ("key" as const),
    credentialHash: credential.hash.toString(),
  };
};

const poolKeyHashOf = (pool: string): string =>
  /^[0-9a-fA-F]{56}$/.test(pool)
    ? pool.toLowerCase()
    : Cardano.PoolId.toKeyHash(Cardano.PoolId(pool)).toString();

/**
 * A local Cardano ledger, validating transactions with the ledger rules and Plutus evaluation
 * of Scalus.
 *
 * - `simulate` runs a transaction against a copy of the ledger and reports what would happen,
 *   leaving the ledger as it was: accepted or not, the rule that rejected it, script logs,
 *   execution units, the fee, and the outputs consumed and produced.
 * - `submit` does the same and keeps the result when the transaction is accepted.
 * - `fork` branches the whole ledger, so one setup can be reused across scenarios.
 * - `provider` is the same ledger as a Mesh `IFetcher`, `ISubmitter` and `IEvaluator`, for
 *   building transactions against it.
 *
 * Transactions are validated in full, signatures included, so they must be signed. Time moves
 * only when told to; there is no epoch processing, so no rewards are paid and no governance
 * actions are enacted.
 */
export class TxEmulator {
  /** The ledger as a Mesh fetcher, submitter and evaluator */
  readonly provider: ScalusEmulator;

  private constructor(readonly emulator: Emulator) {
    this.provider = new ScalusEmulator(emulator);
  }

  /** Create a ledger, without synchronously loading the ESM-only Scalus package */
  static async create(options: TxEmulatorOptions = {}): Promise<TxEmulator> {
    const lib = await import("scalus");
    const info =
      options.info ?? lib.CardanoInfo[options.network ?? "mainnet"]();
    const drepDeposit = info.protocolParams.dRepDeposit;
    const emulator = lib.Emulator.create(info, {
      utxos: (options.utxos ?? []).map((utxo) => fromMeshUtxo(utxo, lib)),
      ...(options.slot !== undefined && { slot: options.slot }),
      stakeRegistrations: (options.stakeRegistrations ?? []).map(
        ({ rewardAddress, rewards, pool }): StakeRegistration => ({
          ...stakeCredentialOf(rewardAddress),
          rewards: rewards ?? 0n,
          ...(pool !== undefined && { delegatedTo: poolKeyHashOf(pool) }),
        }),
      ),
      drepRegistrations: (options.drepRegistrations ?? []).map(
        ({ drepId, deposit }): DRepRegistration => {
          const credential = Cardano.DRepID.toCredential(
            Cardano.DRepID(drepId),
          );
          return {
            credentialType:
              credential.type === Cardano.CredentialType.ScriptHash
                ? "script"
                : "key",
            credentialHash: credential.hash.toString(),
            deposit: deposit ?? drepDeposit,
          };
        },
      ),
      datums: (options.datums ?? []).map((datum) => ({
        hash: resolveDataHash(datum, "CBOR"),
        datum,
      })),
    });
    return new TxEmulator(emulator);
  }

  /**
   * An independent copy of the whole ledger: UTxOs, registrations, datums, accepted
   * transactions and the clock. The copy and this ledger evolve separately from then on.
   */
  fork(): TxEmulator {
    return new TxEmulator(this.emulator.snapshot());
  }

  /** Run a transaction against a copy of the ledger, leaving this ledger unchanged */
  simulate(tx: TxInput): Promise<TxResult> {
    return run(this.emulator.snapshot(), tx);
  }

  /** Run a transaction against the ledger, keeping its effects if it is accepted */
  submit(tx: TxInput): Promise<TxResult> {
    return run(this.emulator, tx);
  }

  /** UTxOs in the ledger, all of them or those matching every given criterion */
  utxos(
    filter: { address?: string; txHash?: string; unit?: string } = {},
  ): UTxO[] {
    return this.emulator.getUtxos(filter).map(toMeshUtxo);
  }

  /** The pool a stake address delegates to, and its reward balance */
  delegation(rewardAddress: string): { pool?: string; rewards: bigint } {
    const { poolId, rewards } = this.emulator.getDelegation(rewardAddress);
    return { ...(poolId !== undefined && { pool: poolId }), rewards };
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
    const { zeroSlot, zeroEpoch, epochLength } =
      this.emulator.getCardanoInfo().slotConfig;
    return zeroEpoch + Math.floor((this.slot - zeroSlot) / epochLength);
  }

  /** Move the clock to a slot */
  setSlot(slot: number): void {
    this.emulator.setSlot(slot);
  }

  /** Move the clock to the slot containing a POSIX time in milliseconds */
  setTime(posixMillis: number): void {
    this.emulator.setTime(posixMillis);
  }

  /** Move the clock forward by a number of slots */
  tick(slots: number): void {
    this.emulator.tick(slots);
  }

  /**
   * Move the clock to the first slot of a later epoch, the next one by default. Only the clock
   * moves: no epoch boundary processing happens.
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
}

/** Run a transaction against a ledger, describing the outcome */
const run = async (emulator: Emulator, input: TxInput): Promise<TxResult> => {
  const txHex =
    typeof input === "string" ? input : transactionPrototypeToHex(input);
  let tx: ReturnType<typeof deserializeTx>;
  try {
    tx = deserializeTx(txHex);
  } catch (error) {
    return {
      accepted: false,
      rule: "InvalidTransaction",
      message: error instanceof Error ? error.message : String(error),
      logs: [],
    };
  }
  const txHash = tx.getId().toString();
  const body = tx.body();
  const isValid = tx.isValid();
  const spent = (isValid ? body.inputs() : body.collateral())?.values() ?? [];
  const consumed = emulator
    .getUtxos({
      outRefs: spent.map((input) => ({
        txHash: input.transactionId().toString(),
        outputIndex: Number(input.index()),
      })),
    })
    .map(toMeshUtxo);

  // Budgets are evaluated while the inputs are still in the ledger. A script failure is left
  // for the submission to report, with its rule and logs.
  let redeemers: Omit<Action, "data">[] = [];
  if (isValid && (tx.witnessSet().redeemers()?.size() ?? 0) > 0) {
    try {
      redeemers = await new ScalusEmulator(emulator).evaluateTx(txHex);
    } catch {
      redeemers = [];
    }
  }

  const result = emulator.submitTx(hexToBytes(txHex));
  if (!result.isSuccess)
    return {
      accepted: false,
      txHash,
      rule: result.errorRule ?? "Unknown",
      message: result.error ?? "",
      logs: result.logs,
    };
  return {
    accepted: true,
    txHash,
    fee: body.fee(),
    isValid,
    redeemers,
    consumed,
    produced: emulator.getUtxos({ txHash }).map(toMeshUtxo),
    logs: result.logs,
  };
};
