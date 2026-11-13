import type { NetworkConfig } from "@meshsdk/common";

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
