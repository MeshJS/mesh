import type { ISubmitter, NetworkConfig } from "@meshsdk/common";

import type { BuildOptions } from "../builder";
import type { Signer } from "../sign";
import type { TxIntent } from "./intent";

/**
 * The deadlines of an intent. The builder's `intentDefaults` and an intent's own options give
 * them; the effective numbers are written into the intent when it is created and never read from
 * the builder again.
 */
export type IntentDeadlines = {
  /**
   * The validity of an attempt whose parts set no `until`, in ms: its deadline is
   * `max(tip time, from) + ttlMs`, which is also the time left to sign it. Above 0; 600 000 when
   * neither the intent nor the builder gives one. An attempt that runs a Plutus script may not
   * end past the network's forecast horizon (`INVALID_STATE`, `pastHorizon`).
   */
  ttlMs?: number;
  /**
   * The margin after an attempt's deadline, in ms, before the intent calls it expired, may
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

/** The waiting of one call of `send()` or `advance()`; never written into the intent */
export type WaitOptions = {
  /** How far the call waits; `"sent"` by default */
  waitFor?: WaitTarget;
  /**
   * How long the call waits for `"included"` or `"final"`, in ms, counted from the answer to its
   * delivery, or from its start when it delivers nothing; then CONFIRM_TIMEOUT. Above 0;
   * 120 000 by default, and for `"final"` the intent's `confirmations` × 30 000 + 120 000
   */
  timeoutMs?: number;
  /** The pause between two looks at the chain, in ms; above 0; the builder's, else 5 000 */
  pollMs?: number;
  /** Aborts the whole call with ABORTED */
  signal?: AbortSignal;
};

/**
 * The options of an intent, given to `builder.intent(parts, options)`. Every attempt is built
 * with the same build options. The data options (`sendAllTo`, `knownUtxos`, `fee`,
 * `registeredPools`, `extraKeyWitnesses`) and the three deadlines are written into the intent;
 * the live objects (`payer`, `after`, `canSelect`, `coinSelection`, `trace`) are kept by the
 * object only.
 * Signers and the submitter are not options of an intent: they belong to the call that signs or
 * sends (`SignOptions`, `SendOptions`).
 *
 * `payer` is the payer of the first attempt and of later ones; a snapshot serves one attempt, and
 * `build({ payer })` gives a new one. `fee` goes into every attempt as given: an attempt whose
 * minimum fee is above it is FEE_TOO_LOW. `trace` gets the build events of every attempt and the
 * `warning` of a submitter that answered with another hash.
 */
export type IntentOptions = Omit<BuildOptions, "signal" | "after"> &
  IntentDeadlines & {
    /** The application's id of the intent, shown as `intent.id`; none is made up */
    id?: string;
    /**
     * The parent intents, kept by the object: each attempt stands on the current attempt of each
     * parent and spends an output of one of them, the parent's change at this intent's change
     * address when its parts and selection spend none. When no parent attempt has such an output
     * (key-locked change at this intent's change address that `canSelect` takes), the attempt
     * takes a general anchor, does not depend on the parent attempt and is never orphaned.
     * Intents only; anything else is INVALID_OPTION. The parents are fixed by the first attempt
     */
    after?: TxIntent | readonly TxIntent[];
  };

/**
 * The options of one call of `send()` or `advance()`: its waiting, who signs and who submits;
 * never written
 */
export type SendOptions = WaitOptions & {
  /** Who signs an attempt that still needs signatures; else the intent's payer, if it can sign */
  signers?: Signer | readonly Signer[];
  /**
   * Who submits; else the builder's submitter, else the provider. A wallet submits only when it
   * is given here, in each call that should go through it
   */
  submitter?: ISubmitter;
};

/** The options of one call of `sign()` */
export type SignOptions = {
  /** Who signs; else the intent's payer, if it can sign */
  signers?: Signer | readonly Signer[];
  /** Aborts the call with ABORTED; signatures already recorded stay */
  signal?: AbortSignal;
};

/**
 * Status of one attempt of an intent. An open list: a later version may add a value, and a value
 * this code does not know is not terminal.
 */
export type TxAttemptStatus =
  /** Signatures are missing */
  | "built"
  /** Fully signed; the intent has not sent it */
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
 * Status of an intent: `abandoned`; `final` or `included` when one of its attempts is; else the
 * status of its current attempt; `draft` before the first attempt. Only `final` (an attempt
 * landed for good) and `abandoned` (none landed and none will) are terminal, in every later
 * version too.
 */
export type TxIntentStatus =
  | TxAttemptStatus
  /** No attempt yet */
  | "draft"
  /** Closed: no attempt landed and none will */
  | "abandoned";

/**
 * One attempt of an intent: one transaction body, one `txHash`. The attempts of an intent are
 * built from the same parts and differ only in what the library chooses: the inputs, the anchor,
 * the deadline, and for a child the parent attempts.
 */
export type TxAttempt = {
  /** The hash of the attempt's body; signatures do not change it */
  readonly txHash: string;
  /**
   * Another hash the submitter answered with, normalised (trimmed, unquoted, lower-case; an answer
   * that is not 64 hex characters is not kept). A note only: the intent searches `txHash` alone
   * and decides nothing by this one
   */
  readonly reportedHash?: string;
  /** The attempt's status */
  readonly status: TxAttemptStatus;
  /** The deadline: the end of the validity interval, POSIX ms */
  readonly until: number;
  /**
   * How many deliveries of the attempt the intent recorded: the first, and one more for each
   * delivery made after a refusal and new signatures. A resend of the same bytes is not counted
   */
  readonly sends: number;
  /** The block the attempt was last found in */
  readonly seen?: { readonly slot: number; readonly block?: string };
  /**
   * The parent attempts it is built on, one per parent intent. Every attempt of one intent names
   * the same parent intents. `until` is the parent attempt's deadline: the child's attempt is
   * orphaned from it, counted with the child's own margin. `intentId` is the parent intent's id,
   * always present in a store
   */
  readonly parents?: readonly {
    readonly txHash: string;
    readonly until: number;
    readonly intentId?: string;
  }[];
};

/**
 * An intent as data: what a store holds and what the intent is restored from. Applications read
 * `id`, `rev`, `status`, `closing`, `deadlines` and `attempts`; `anchor`, `parts`, `options` and
 * the other fields of an attempt are the library's.
 */
export type TxIntentJSON = {
  /** Always `"TxIntent"`: what kind of record this is */
  readonly kind: "TxIntent";
  /**
   * The record format; this release writes 1. A library writes its own version only: it migrates
   * an older version when it reads it. A newer version, another kind, or content it does not know
   * (a part kind, a status) is never read further or overwritten
   */
  readonly version: number;
  /** The intent's id, when it has one */
  readonly id?: string;
  /** The revision: one higher with every change of the record */
  readonly rev: number;
  /**
   * The intent's status, worked out from its attempts as `TxIntentStatus` describes, and written
   * with every change of the record. It may differ from the current attempt's status: an included
   * or final attempt decides it, and `abandoned` stays once the intent is closed
   */
  readonly status: TxIntentStatus;
  /** The decision to close the intent has been recorded; never removed */
  readonly closing?: true;
  /** The network the intent's attempts are built for: its name, or its full configuration */
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
  /** The library's: the inputs the attempts spend so that at most one of them can land */
  readonly anchor: unknown;
  /** The library's encoding of the intent's parts */
  readonly parts: unknown[];
  /** The library's: the data options of the intent */
  readonly options: Record<string, unknown>;
};
