import type { ISubmitter, NetworkConfig } from "@meshsdk/common";

import type { SelectInputs } from "../balance";
import type { BuildEvent, BuildOptions } from "../builder";
import type { Utxo } from "../parts/types";
import type { Payer } from "../payer";
import type { Signer } from "../sign";
import type { TxPlan } from "./plan";

/**
 * The deadlines of a plan. The builder's `planDefaults` and a plan's own options give
 * them; the effective numbers are written into the plan when it is created and never read from
 * the builder again.
 */
export type PlanDeadlines = {
  /**
   * The validity of an attempt whose parts set no `until`, in ms: its deadline is
   * `max(tip time, from) + ttlMs`, which is also the time left to sign it. Above 0; 600 000 when
   * neither the plan nor the builder gives one. An attempt that runs a Plutus script may not
   * end past the network's forecast horizon (`INVALID_STATE`, `pastHorizon`).
   */
  ttlMs?: number;
  /**
   * The margin after an attempt's deadline, in ms, before the plan calls it expired, may
   * change the payer's anchor or may be closed; also the length of the double check's pause, up
   * to a minute. It plays no part in `final`. 0 or more; 600 000 by default; 0 only on an
   * emulator.
   */
  expiryMarginMs?: number;
  /**
   * The depth of `final`: at least this many blocks on top of the attempt's block, counted by
   * block heights and never by time. A whole number, 0 or more; 30 by default; 0 only on an
   * emulator.
   */
  confirmations?: number;
};

/**
 * How far a call of `send()` or `advance()` waits: the answer to its delivery, a block, or
 * `final`
 */
export type WaitTarget = "sent" | "included" | "final";

/** The waiting of one call of `send()` or `advance()`; never written into the plan */
export type WaitOptions = {
  /** How far the call waits; `"sent"` by default */
  waitFor?: WaitTarget;
  /**
   * How long the call waits for `"included"` or `"final"`, in ms, counted from the answer to its
   * delivery, or from its start when it delivers nothing; then CONFIRM_TIMEOUT. Above 0;
   * 120 000 by default, and for `"final"` the plan's `confirmations` × 30 000 + 120 000
   */
  timeoutMs?: number;
  /** The pause between two looks at the chain, in ms; above 0; the builder's, else 5 000 */
  pollMs?: number;
  /** Aborts the whole call with ABORTED */
  signal?: AbortSignal;
};

/**
 * The options of a plan, given to `builder.plan(parts, options)`. Every attempt is built
 * with the same build options. The data options (`sendAllTo`, `knownUtxos`, `fee`,
 * `registeredPools`, `extraKeyWitnesses`, `topUpCollateral`, `collateralReturn`) and the three
 * deadlines are written into the plan; the live objects (`payer`, `after`, `canSelect`,
 * `coinSelection`, `trace`) are kept by the object only.
 * Signers and the submitter are not options of a plan: they belong to the call that signs or
 * sends (`SignOptions`, `SendOptions`).
 *
 * `payer` is the payer of the first attempt and of later ones; a snapshot serves one attempt, and
 * `build({ payer })` gives a new one. `fee` goes into every attempt as given: an attempt whose
 * minimum fee is above it is FEE_TOO_LOW. `trace` gets the build events of every attempt and the
 * `warning` of a submitter that answered with another hash.
 */
export type PlanOptions = Omit<BuildOptions, "signal" | "after"> &
  PlanDeadlines & {
    /**
     * The application's id of the plan, shown as `plan.id`; none is made up. Required on a
     * builder with a store, where it is the key of the record: an id already recorded is the
     * same plan, and its parts, explicit deadlines, data options and `after` must be the
     * recorded ones (PLAN_EXISTS)
     */
    id?: string;
    /**
     * The parent plans, kept by the object: each attempt stands on the current attempt of each
     * parent and spends an output of one of them, the parent's change at this plan's change
     * address when its parts and selection spend none. When no parent attempt has such an output
     * (key-locked change at this plan's change address that `canSelect` takes), the attempt
     * takes a general anchor, does not depend on the parent attempt and is never orphaned.
     * Plans only; anything else is INVALID_OPTION. The parents are fixed by the first attempt.
     * On a builder with a store: plans of a builder with a store only, so that a restart can
     * find them; for a recorded id, the recorded parents (an empty list names none), else
     * PLAN_EXISTS; not given, they are taken from the record
     */
    after?: TxPlan | readonly TxPlan[];
  };

/**
 * The options of `builder.resume(id, options)`: the live objects of a plan, given again after
 * a restart; none of them is written into the record. The deadlines and the data options stay as
 * recorded.
 *
 * The payer is not called and not compared here: it is compared with the record when the plan
 * builds a new attempt (PAYER_MISMATCH), so never on a plan with the closing mark nor on a
 * terminal one, and never for a resend of the same bytes. Without a payer the plan goes on
 * with its current attempt, and a new attempt is MISSING_PAYER: the recorded change address is
 * not a payer. Nothing about `canSelect` and `coinSelection` is recorded: not given again, a new
 * attempt is built without the filter and with the builder's strategy, and spends the same
 * anchor.
 */
export type ResumeOptions = {
  /** The payer of new attempts; checked against the record when one is built */
  payer?: Payer;
  /**
   * The recorded parents, as plans: each with the recorded id and holding the recorded parent
   * attempt; all of them and no others, in any order. Any other set, an empty list for a record
   * that names parents too, is INVALID_OPTION. Omitted:
   * each parent is loaded from the store by its id (not found, or found without the recorded
   * attempt: PLAN_NOT_FOUND with the parent's id in `error.planId`), and read again before
   * every new attempt
   */
  after?: TxPlan | readonly TxPlan[];
  /** The filter of the payer's UTxOs for new attempts */
  canSelect?: (utxo: Utxo) => boolean;
  /** The selection of the payer's UTxOs for new attempts */
  coinSelection?: SelectInputs;
  /** Gets the build events of new attempts and the warnings of the plan; never recorded */
  trace?: (event: BuildEvent) => void;
};

/**
 * The options of one call of `send()` or `advance()`: its waiting, who signs and who submits;
 * never written
 */
export type SendOptions = WaitOptions & {
  /**
   * Who signs an attempt that still needs signatures; else the plan's payer, if it can sign.
   * Each is asked once, in order; a signer that takes a list of keys is handed those that have
   * not signed yet, and a signer of transaction hashes is not asked when none is left
   */
  signers?: Signer | readonly Signer[];
  /**
   * Who submits; else the builder's submitter, else the provider. A wallet submits only when it
   * is given here, in each call that should go through it
   */
  submitter?: ISubmitter;
};

/** The options of one call of `sign()` */
export type SignOptions = {
  /**
   * Who signs; else the plan's payer, if it can sign. Each is asked once, in order; a signer that
   * takes a list of keys is handed those that have not signed yet, and a signer of transaction
   * hashes is not asked when none is left
   */
  signers?: Signer | readonly Signer[];
  /** Aborts the call with ABORTED; signatures already recorded stay */
  signal?: AbortSignal;
};

/**
 * Status of one attempt of a plan. An open list: a later version may add a value, and a value
 * this code does not know is not terminal.
 */
export type TxAttemptStatus =
  /** Signatures are missing */
  | "built"
  /** Fully signed; the plan has not sent it */
  | "signed"
  /** Delivered: accepted, or the outcome is unknown */
  | "sent"
  /** Refused, and so was every earlier delivery of it */
  | "rejected"
  /** Found by a fresh search in a block, with `is_valid = true` */
  | "included"
  /** Its deadline and the margin have passed, and it is not on chain */
  | "expired"
  /** In a block with `is_valid = false`: the collateral is taken and it cannot land */
  | "failed"
  /** The parent attempt whose output it spends is dead */
  | "orphaned"
  /** In a block with at least `confirmations` blocks on top of it, and still found */
  | "final";

/**
 * Status of a plan: `abandoned`; `final` or `included` when one of its attempts is; else the
 * status of its current attempt; `draft` before the first attempt. Only `final` (an attempt
 * landed for good) and `abandoned` (none landed and none will) are terminal, in every later
 * version too.
 */
export type TxPlanStatus =
  | TxAttemptStatus
  /** No attempt yet */
  | "draft"
  /** Closed: no attempt landed and none will */
  | "abandoned";

/**
 * One attempt of a plan: one transaction body, one `txHash`. The attempts of a plan are
 * built from the same parts and differ only in what the library chooses: the inputs, the anchor,
 * the deadline, and for a child the parent attempts.
 */
export type TxAttempt = {
  /** The hash of the attempt's body; signatures do not change it */
  readonly txHash: string;
  /**
   * Another hash the submitter answered with, normalised (trimmed, unquoted, lower-case; an answer
   * that is not 64 hex characters is not kept). A note only: the plan searches `txHash` alone
   * and decides nothing by this one
   */
  readonly reportedHash?: string;
  /** The attempt's status */
  readonly status: TxAttemptStatus;
  /** The deadline: the end of the validity interval, POSIX ms */
  readonly until: number;
  /**
   * How many deliveries of the attempt the plan recorded: the first, and one more for each
   * delivery made after a refusal and new signatures. A resend of the same bytes is not counted
   */
  readonly sends: number;
  /** The block the attempt was last found in */
  readonly seen?: { readonly slot: number; readonly block?: string };
  /**
   * The parent attempts it is built on, one per parent plan. Every attempt of one plan names
   * the same parent plans. `until` is the parent attempt's deadline: the child's attempt is
   * orphaned from it, counted with the child's own margin. `planId` is the parent plan's id,
   * always present in a store
   */
  readonly parents?: readonly {
    readonly txHash: string;
    readonly until: number;
    readonly planId?: string;
  }[];
};

/**
 * A plan as data, in its encoded form: what `plan.toJSON()` returns and a store holds. Plain
 * JSON data: every `bigint` of the parts and of the transactions stands as its decimal string,
 * POSIX times as numbers, so `JSON.parse(JSON.stringify(json))` gives it back unchanged.
 * Applications read `id`, `rev`, `status`, `closing`, `deadlines` and `attempts`; `anchor`,
 * `parts`, `options` and the other fields of an attempt are the library's.
 */
export type TxPlanJSON = {
  /** Always `"TxPlan"`: what kind of record this is */
  readonly kind: "TxPlan";
  /**
   * The record format; this release writes 1. A library writes its own version only: it
   * migrates an older version when it reads it and saves it in its own with its next write. A
   * newer version, another kind, or content it does not know (a part kind, a status, a member)
   * is never read further or overwritten: INVALID_STATE (`recordVersion`)
   */
  readonly version: number;
  /** The plan's id, when it has one; always in a store */
  readonly id?: string;
  /** The revision: 0 for a draft that was never written, one higher with every change */
  readonly rev: number;
  /**
   * The plan's status, worked out from its attempts as `TxPlanStatus` describes, and written
   * with every change of the record. It may differ from the current attempt's status: an included
   * or final attempt decides it, and `abandoned` stays once the plan is closed
   */
  readonly status: TxPlanStatus;
  /** The decision to close the plan has been recorded; never removed */
  readonly closing?: true;
  /**
   * The network the plan's attempts are built for: the name of a public network
   * (`"mainnet"`, `"preprod"`, `"preview"`), else its full configuration
   */
  readonly network: string | NetworkConfig;
  /**
   * The effective deadlines, all three always: the validity length of an attempt, the margin
   * after an attempt's deadline, and the depth at which an attempt is final
   */
  readonly deadlines: {
    readonly ttlMs: number;
    readonly expiryMarginMs: number;
    readonly confirmations: number;
  };
  /** The attempts, in the order they were built; the current one is last */
  readonly attempts: readonly TxAttempt[];
  /**
   * The library's: the inputs the attempts spend so that at most one of them can land, each as
   * a full UTxO with the attempts built on it
   */
  readonly anchor: unknown;
  /**
   * The library's encoding of the plan's parts; never null, since a plan is made from parts
   * only
   */
  readonly parts: unknown[];
  /**
   * The library's: the data options of the plan, and the payer's change address once an
   * attempt is built; nothing about `canSelect`, `coinSelection`, signers or the submitter
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
