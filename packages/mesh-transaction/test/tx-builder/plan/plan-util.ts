import type { BuiltTx, Utxo } from "../../../src/tx-builder";
import {
  Advanced,
  advancePlan,
  AnchorKind,
  draftPlan,
  PlanRecord,
  TxPlanEvent,
} from "../../../src/tx-builder/plan/core";

/** A 32-byte hash from a number */
export const hash = (n: number) => n.toString(16).padStart(64, "0");

/** A 28-byte key hash from a number */
export const keyHash = (n: number) => n.toString(16).padStart(56, "a");

const ADDRESS =
  "addr_test1qpq6xvp5y4fw0wfgxfqmn78qqagkpv4q7qpqyz8s8x3snp5n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgsc3xk2w";

/** An output of `txHash` at `outputIndex`, holding some ada */
export const utxo = (txHash: string, outputIndex = 0): Utxo => ({
  txHash,
  outputIndex,
  address: ADDRESS,
  value: { lovelace: 5_000_000n },
});

/**
 * A built transaction with the members the state machine reads: its hash, its inputs, the keys
 * that must sign, its deadline and, for a Plutus transaction, one redeemer.
 */
export const builtTx = (spec: {
  txHash: string;
  inputs: readonly Utxo[];
  keys?: readonly string[];
  until?: number;
  plutus?: boolean;
}): BuiltTx =>
  ({
    tx: "84a0",
    txHash: spec.txHash,
    inputs: [...spec.inputs],
    signers: {
      keyHashes: [...(spec.keys ?? [])],
      keys: (spec.keys ?? []).map((keyHash) => ({
        keyHash,
        roles: ["input"],
      })),
      byronAddresses: [],
      nativeScripts: [],
    },
    validity: spec.until === undefined ? {} : { until: spec.until },
    redeemers: spec.plutus
      ? [
          {
            tag: "SPEND",
            index: 0,
            exUnits: { mem: 1n, steps: 1n },
            data: "00",
            part: "spend",
          },
        ]
      : [],
  }) as unknown as BuiltTx;

/** A build event spending `anchors` (and `extra` inputs) */
export const buildEvent = (spec: {
  txHash: string;
  anchors: readonly { utxo: Utxo; kind: AnchorKind }[];
  extra?: readonly Utxo[];
  keys?: readonly string[];
  until?: number;
  plutus?: boolean;
  parents?: readonly { txHash: string; until: number; planId?: string }[];
  tipTimeMs?: number;
}): TxPlanEvent => ({
  type: "build",
  built: builtTx({
    txHash: spec.txHash,
    inputs: [...spec.anchors.map((a) => a.utxo), ...(spec.extra ?? [])],
    keys: spec.keys,
    until: "until" in spec ? spec.until : 1_000_000,
    plutus: spec.plutus,
  }),
  anchors: spec.anchors,
  ...(spec.parents !== undefined && { parents: spec.parents }),
  ...(spec.tipTimeMs !== undefined && { tipTimeMs: spec.tipTimeMs }),
});

/** A witness of one key */
export const witness = (key: string) => ({ keyHash: key, witness: `w-${key}` });

/** A new record, with the deadlines given */
export const draft = (
  deadlines: Partial<PlanRecord["deadlines"]> = {},
): PlanRecord =>
  draftPlan({
    id: "plan-1",
    network: "preprod",
    deadlines: {
      ttlMs: 600_000,
      expiryMarginMs: 100_000,
      confirmations: 3,
      ...deadlines,
    },
    parts: [],
    options: {},
  });

/** The record after the event; fails the test when the event is refused */
export const accept = (json: PlanRecord, event: TxPlanEvent) => {
  const result = advancePlan(json, event);
  if (!result.ok)
    throw new Error(
      `${event.type} refused (${result.reason}): ${result.message}`,
    );
  return result.json;
};

/** The record after every event, in order */
export const acceptAll = (
  json: PlanRecord,
  ...events: readonly TxPlanEvent[]
) => events.reduce(accept, json);

/** The reason of a refusal; fails the test when the event is accepted */
export const refusal = (json: PlanRecord, event: TxPlanEvent) => {
  const result: Advanced = advancePlan(json, event);
  if (result.ok) throw new Error(`${event.type} accepted`);
  return result.reason;
};

/** The attempt with this hash */
export const attemptOf = (json: PlanRecord, txHash: string) => {
  const attempt = json.attempts.find((each) => each.txHash === txHash);
  if (attempt === undefined) throw new Error(`no attempt ${txHash}`);
  return attempt;
};

/** Freezes the value in place, all the way down, and returns it; nothing is copied */
export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value))
      deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
};

/** A small seeded generator, so that a failing run can be repeated from its seed */
export const seeded = (seed: number) => {
  let state = seed >>> 0 || 1;
  const next = () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[int(items.length)]!,
  };
};
export type Random = ReturnType<typeof seeded>;
