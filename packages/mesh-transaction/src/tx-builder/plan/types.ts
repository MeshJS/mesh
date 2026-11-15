import type { ISubmitter, NetworkConfig } from "@meshsdk/common";

import type { BuildEvent, BuildOptions, BuiltTxData } from "../builder";
import type { LinkedPart, TxPart } from "../parts/types";
import type { Payer } from "../payer";
import type { Signer } from "../sign";
import type { RequiredKey } from "../witnesses";

/**
 * The deadlines of a plan. The builder's `planDefaults` and a plan's own options give
 * them; the effective numbers are written into the plan when it is made and never read from
 * the builder again.
 */
export type PlanDeadlines = {
  /**
   * The validity of a step whose parts set no `until`, in ms: it ends at
   * `max(tip time, from) + ttlMs`, the tip read once when the plan is made (for a step `add`
   * adds, once by that call), which is also the time left to sign it. Above 0; 600 000 when neither the plan nor the builder gives one. A
   * step that runs a Plutus script may not end past the network's forecast horizon
   * (`INVALID_STATE`, `pastHorizon`).
   */
  ttlMs?: number;
  /**
   * The margin after a step's end of validity, in ms, before the plan calls it expired. It plays
   * no part in `final`. 0 or more; 600 000 by default; 0 only on an emulator.
   */
  expiryMarginMs?: number;
  /**
   * The depth of `final`: at least this many blocks on top of the step's block, counted by
   * block heights and never by time. A whole number, 0 or more; 30 by default; 0 only on an
   * emulator.
   */
  confirmations?: number;
};

/** How far a call of `run()` goes: a delivery, a block, or `final` */
export type WaitTarget = "sent" | "included" | "final";

/**
 * One entry of a step's parts: a part, a part linked to an earlier step, a nested list, or a
 * value that is skipped
 */
export type StepPartEntry =
  TxPart | LinkedPart | false | null | undefined | readonly StepPartEntry[];

/** The parts of one step: one part, or a list; nested lists are flattened, as for `build` */
export type StepParts = TxPart | LinkedPart | readonly StepPartEntry[];

/**
 * The build options a step may have of its own; each replaces the plan's for that step. A step
 * with a payer of its own is built on that payer's UTxOs, and its change goes to that payer
 */
export type StepOptions = Pick<
  BuildOptions,
  | "payer"
  | "canSelect"
  | "coinSelection"
  | "sendAllTo"
  | "fee"
  | "registeredPools"
  | "extraKeyWitnesses"
  | "topUpCollateral"
  | "collateralReturn"
>;

/**
 * One step of a plan, as `builder.plan` takes it: its parts, which the plan builds into a
 * transaction, or its parts with options of their own, `{ parts, payer?, ... }`
 */
export type PlanStep =
  StepParts | ({ readonly parts: StepParts } & StepOptions);

/**
 * The steps of a plan by name, in the order they are sent. A name is a non-empty text that is
 * not a whole number and does not start with `consolidate-`
 */
export type PlanSteps = Readonly<Record<string, PlanStep>>;

/**
 * The options of `builder.plan(steps, options)`. The build options apply to every step built
 * from parts, unless the step has its own; `sendAllTo` and `fee` describe one transaction, so
 * with named steps they are given in the step, and here are INVALID_OPTION. The deadlines and
 * the data options (`knownUtxos`, `registeredPools`, `extraKeyWitnesses`, `topUpCollateral`,
 * `collateralReturn`, `consolidate`, and the payer's change address) are written into the plan;
 * `payer`, `after`, `canSelect`, `coinSelection`, `signal` and `trace` are kept by the object
 * only, or not at all.
 */
export type PlanOptions = Omit<BuildOptions, "after"> &
  PlanDeadlines & {
    /**
     * The application's id of the plan, shown as `plan.id`; none is made up. On a builder with a
     * store it is required and is the key of the record: an id already recorded is the same plan,
     * returned as recorded, with nothing built, when its steps and options are the recorded
     * ones (the steps it was made with, or all the steps it has after `add`, in order), else
     * PLAN_EXISTS
     */
    id?: string;
    /**
     * Transactions built before this plan and not yet seen by the provider, as for `build`. A
     * plan given here stands for its steps that may still land or are in a block; a final step
     * stands for what it spent alone, and what it left is taken from the payer's read
     */
    after?: BuildOptions["after"];
    /**
     * `true`, the default: when a step built from parts does not fit a transaction because of
     * the inputs its selection needs (TX_TOO_LARGE, `cause: "selection"`), the plan puts
     * consolidation steps before it, `consolidate-1`, `consolidate-2`, … with
     * `kind: "consolidation"`: transactions that spend the payer's UTxOs and pay the payer
     * alone, the tokens the step does not need in outputs of their own. At most `maxSteps` of
     * them in the plan as a whole, those `plan.add` puts in counted (a whole number from 1 to
     * 31; 4 by default). `false`: such a step is TX_TOO_LARGE, as from `build`. A step with
     * `sendAllTo` is never consolidated. Written into the plan when given; `plan.add` follows it
     */
    consolidate?: boolean | { readonly maxSteps?: number };
  };

/**
 * The options of `builder.resume`: the live objects of a plan, given again after a restart;
 * none of them is written into the record
 */
export type ResumeOptions = {
  /**
   * Signs when a call names no signer, when it can sign. Pays the steps `add` builds that name
   * no payer, when its change address is the plan's
   */
  payer?: Payer;
  /** Gets the warnings of the plan; never recorded */
  trace?: (event: BuildEvent) => void;
};

/** The options of one call of `sign()`. A member other than these is INVALID_OPTION */
export type SignOptions = {
  /**
   * Who signs; else the plan's payer, when it can sign. Each is asked once for each step, in
   * order; a signer that takes a list of keys is handed those that have not signed yet, and a
   * signer of transaction hashes is not asked when none is left
   */
  signers?: Signer | readonly Signer[];
  /** Aborts the call with ABORTED; signatures already recorded stay */
  signal?: AbortSignal;
};

/**
 * The options of one call of `run()`; never written. A member other than these is
 * INVALID_OPTION
 */
export type RunOptions = {
  /** Who signs a step that still needs signatures when its turn comes; else the plan's payer */
  signers?: Signer | readonly Signer[];
  /**
   * Who submits; else the builder's submitter, else the provider. A wallet submits only when it
   * is given here, in each call that should go through it
   */
  submitter?: ISubmitter;
  /**
   * How far the call goes. `"included"`, the default: until every step is in a block. `"final"`:
   * until every step is final. `"sent"`: it does what can be done at once (signs and sends the
   * step whose turn it is) and returns without waiting for a block
   */
  waitFor?: WaitTarget;
  /**
   * How long the call waits for a block or for depth, in ms, counted anew from the answer to
   * the first send of each step in the call; then CONFIRM_TIMEOUT. Every request the call waits
   * for (a search, the tip, a read or write of the store, a submit) is waited for no longer than
   * the time left: a submit that does not answer in time leaves its delivery recorded and its
   * outcome unknown, as a lost answer does
   */
  timeoutMs?: number;
  /** The pause between two looks at the chain, in ms; the builder's, else 5 000 */
  pollMs?: number;
  /** Aborts the whole call with ABORTED */
  signal?: AbortSignal;
};

/**
 * Status of one step of a plan. An open list: a later version may add a value, and a value this
 * code does not know means neither "landed" nor "will not land".
 */
export type TxStepStatus =
  /** Signatures are missing */
  | "built"
  /** Fully signed; the plan has not sent it */
  | "signed"
  /** Delivered: accepted, or the outcome is unknown */
  | "sent"
  /** The ledger refused it, and every earlier delivery of it; the same bytes may still be sent */
  | "rejected"
  /** Found by a fresh search in a block, with `is_valid = true`; a rollback can undo it */
  | "included"
  /** In a block with at least `confirmations` blocks on top of it */
  | "final"
  /** Its validity has ended, the margin has passed, and it is not on chain: it will not land */
  | "expired"
  /** In a block with `is_valid = false`: the collateral is taken, and it will not land */
  | "failed"
  /**
   * A step it stands on will not land, so it will not either. It is orphaned only while that is
   * so: when a look finds that step in a block after all, it is `sent` again if it was sent or
   * found before, else `signed` or `built`
   */
  | "orphaned";

/**
 * Status of a plan, worked out from its steps and its mark:
 * - `pending`: it may still complete;
 * - `stopping`: it does not go on: a step will not land, or the plan was stopped. Steps that
 *   are not known to be dead may still land, since another party may sign or send them (`live`
 *   lists them), or a step in a block may still be rolled back;
 * - `stopped`: it does not go on, and every step is final or will not land. `landed` says what
 *   did;
 * - `final`: every step is final.
 *
 * Only `final` and `stopped` are terminal: a final plan never changes, and a stopped one changes
 * only when a look finds one of its steps in a block after all. It is then `stopping`, or `final`
 * once every step is: a plan that was `stopped` sends no step for the first time, and sends again
 * only the steps it sent. A group of transactions is not atomic: whether one payment went
 * through is the status of its step.
 */
export type TxPlanStatus = "pending" | "stopping" | "stopped" | "final";

/**
 * One step of a plan: the data of its transaction, as `build` gives it, with its place in the
 * plan. It goes wherever a `BuiltTxData` goes (`after`, `utxosAfter`, `outputOf`).
 */
export type TxStep = Readonly<BuiltTxData> & {
  /** The name the application gave the step; `main` for a plan made from one list of parts */
  readonly name: string;
  /** `"consolidation"` for a step the plan put in itself; absent for a step the application gave */
  readonly kind?: "consolidation";
  readonly status: TxStepStatus;
  /** The keys the transaction needs that have not signed it yet, each with its roles */
  readonly missing: readonly RequiredKey[];
  /** The transaction with every witness it needs, from `signed` on */
  readonly signedTx?: string;
  /** The names of the earlier steps whose outputs it spends, reads or puts up as collateral */
  readonly standsOn: readonly string[];
  /** The block it was last found in */
  readonly seen?: { readonly slot: number; readonly block?: string };
};

/**
 * One step of a plan as its record holds it. Applications read `name`, `kind`, `status` and
 * `txHash`; the rest is the library's.
 */
export type TxStepJSON = {
  readonly name: string;
  readonly kind?: "consolidation";
  /** The library's: the step was added to the plan after it was made; absent otherwise */
  readonly added?: true;
  readonly status: TxStepStatus;
  readonly txHash: string;
  /** The block it was last found in; kept when a rollback takes it out of the block */
  readonly seen?: { readonly slot: number; readonly block?: string };
  /** The library's: the names of the steps it stands on; absent when none */
  readonly standsOn?: readonly string[];
  /** The library's: the hashes of the transactions of `after` it stands on; absent when none */
  readonly after?: readonly string[];
  /**
   * The library's: for a step every input of which comes from a transaction of `after`, a
   * transaction on chain before it, which a look searches to show that a step not found expired
   */
  readonly expirySource?: string;
  /** The library's: how many deliveries of it were recorded, and how many of them were refused */
  readonly sends: number;
  readonly refused: number;
  /** The library's: the transaction with the witnesses it holds, as the JSON of a `BuiltTx` */
  readonly tx: {
    readonly kind: "BuiltTx";
    readonly version: number;
    readonly txHash: string;
    readonly built: Record<string, unknown>;
    readonly witnesses?: string;
    readonly extraKeyWitnesses?: number;
    readonly delivered?: true;
  };
  /** The library's: the step as it was given, its parts (links kept) and its data options */
  readonly given?: {
    readonly parts: readonly unknown[];
    readonly options?: Record<string, unknown>;
  };
};

/**
 * A plan as data: what `plan.toJSON()` returns and a store holds. Plain JSON data: every
 * `bigint` of the parts and of the transactions stands as its decimal string, POSIX times as
 * numbers, so `JSON.parse(JSON.stringify(json))` gives it back unchanged. Applications read
 * `id`, `rev`, `status`, `stopped`, `replaces`, `replacedBy`, `deadlines` and, of each step,
 * `name`, `kind`, `status` and `txHash`; the rest is the library's.
 */
export type TxPlanJSON = {
  /** Always `"TxPlan"`: what kind of record this is */
  readonly kind: "TxPlan";
  /**
   * The record format; this release writes 2. A record of another version, another kind, or
   * with content this library does not know (a status, a part kind, a member) is never read
   * further or overwritten: INVALID_STATE (`recordVersion`)
   */
  readonly version: number;
  /** The plan's id, when it has one; always in a store */
  readonly id?: string;
  /** The revision: one higher with every change of the record, 1 for the first */
  readonly rev: number;
  /** The plan's status, worked out from its steps and its mark */
  readonly status: TxPlanStatus;
  /** The decision that the plan signs and sends nothing more is recorded; never removed */
  readonly stopped?: true;
  /**
   * The plan came to `stopped` by steps that will not land: it sends no step for the first time,
   * whatever is found later; never removed
   */
  readonly halted?: true;
  /** The id of the plan it was made in place of */
  readonly replaces?: string;
  /** The id of the plan made in its place */
  readonly replacedBy?: string;
  /**
   * The network the plan's transactions are built for: the name of a public network
   * (`"mainnet"`, `"preprod"`, `"preview"`), else its full configuration
   */
  readonly network: string | NetworkConfig;
  /** The effective deadlines, all three always */
  readonly deadlines: {
    readonly ttlMs: number;
    readonly expiryMarginMs: number;
    readonly confirmations: number;
  };
  /** The steps, in the order they are sent */
  readonly steps: readonly TxStepJSON[];
  /**
   * The library's: the data options of the plan and the plan's payer's change address; nothing
   * about `canSelect`, `coinSelection`, signers or the submitter
   */
  readonly options: Record<string, unknown>;
};

/** What a store holds: a record with its id */
export type StoredTxPlanJSON = TxPlanJSON & { readonly id: string };

/**
 * Where the records of plans are kept: the application's database, file or browser storage.
 * A store keeps each record under its `id` as it was saved, with no members of its own, and
 * writes it only over the revision the writer read, so that two writers of one plan never both
 * succeed. `memoryPlanStore()` keeps records in memory, for tests; `checkPlanStore(store)`
 * checks a store before it is used.
 */
export interface TxPlanStore {
  /** The record saved last under `id`, or `undefined` when there is none */
  load(id: string): Promise<StoredTxPlanJSON | undefined>;
  /**
   * Writes `json` under `json.id` only when the stored revision is `expectedRev` (0: only when
   * no record is stored); `json.rev` is `expectedRev + 1`. `true`: written; `false`: another
   * revision is stored, and nothing was written; a throw: unknown, the write may have passed
   */
  save(json: StoredTxPlanJSON, expectedRev: number): Promise<boolean>;
}
