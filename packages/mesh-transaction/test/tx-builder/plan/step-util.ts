import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  Protocol,
} from "@meshsdk/core";
import { Crypto } from "@meshsdk/core-cst";

import type { BuiltTxData, Utxo } from "../../../src/tx-builder";
import type {
  NewStep,
  StepAdvanced,
  StepPlanEvent,
  StepPlanRecord,
  StepRecord,
} from "../../../src/tx-builder/plan/step-core";
import type { KeyWitness } from "../../../src/tx-builder/sign";
import {
  output,
  referenceInput,
  spend,
  TxBuilder,
  validity,
} from "../../../src/tx-builder";
import {
  advanceStepPlan,
  emptyStepPlan,
  keyHashOfVkey,
} from "../../../src/tx-builder/plan/step-core";
import { baseAddress } from "../../test-util";
import { TestKey, testKey } from "../hash-signer-util";
import { hash } from "./plan-util";

// Helpers of the tests of a plan of steps: transactions with the members the state machine
// reads, plans made of them, and plans of real transactions for the record.

export { deepFreeze, hash, seeded, utxo } from "./plan-util";

/** A public key of the tests, 32 bytes in hex, from a number */
export const vkeyOf = (n: number) => n.toString(16).padStart(64, "7");

const vkeys = new Map<string, string>();

/** The hash of the public key `vkeyOf(n)`: a key a test witness can be made for */
export const keyHash = (n: number) => {
  const hashed = keyHashOfVkey(vkeyOf(n))!;
  vkeys.set(hashed, vkeyOf(n));
  return hashed;
};

/** A built transaction with the members the state machine reads */
export const stepTx = (spec: {
  txHash: string;
  inputs?: readonly Utxo[];
  referenceInputs?: readonly Utxo[];
  collateral?: readonly Utxo[];
  keys?: readonly string[];
  until?: number;
  plutus?: boolean;
}): BuiltTxData =>
  ({
    tx: "84a0",
    txHash: spec.txHash,
    inputs: [...(spec.inputs ?? [])],
    referenceInputs: [...(spec.referenceInputs ?? [])],
    ...(spec.collateral !== undefined && {
      collateral: { inputs: [...spec.collateral], total: 5_000_000n },
    }),
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
  }) as unknown as BuiltTxData;

/** A witness of one key; the state machine takes witnesses already verified */
export const witnessOf = (
  keyHash: string,
  kind: KeyWitness["kind"] = "vkey",
): KeyWitness => ({
  kind,
  vkey: vkeys.get(keyHash)!,
  signature: "5".repeat(128),
  keyHash,
  ...(kind === "bootstrap" && { chainCode: "c".repeat(64), attributes: "a0" }),
});

export const DEADLINES = {
  ttlMs: 600_000,
  expiryMarginMs: 100_000,
  confirmations: 3,
} as const;

/** An empty plan with the tests' deadlines */
export const emptyPlan = (
  deadlines: Partial<StepPlanRecord["deadlines"]> = {},
): StepPlanRecord =>
  emptyStepPlan({
    id: "plan-1",
    network: "preprod",
    deadlines: { ...DEADLINES, ...deadlines },
    options: {},
  });

/** The record after the event; fails the test when the event is refused */
export const accept = (json: StepPlanRecord, event: StepPlanEvent) => {
  const result = advanceStepPlan(json, event);
  if (!result.ok)
    throw new Error(
      `${event.type} refused (${result.reason}): ${result.message}`,
    );
  return result.json;
};

/** The record after every event, in order */
export const acceptAll = (
  json: StepPlanRecord,
  ...events: readonly StepPlanEvent[]
) => events.reduce(accept, json);

/** The reason of a refusal; fails the test when the event is accepted */
export const refusal = (json: StepPlanRecord, event: StepPlanEvent) => {
  const result: StepAdvanced = advanceStepPlan(json, event);
  if (result.ok) throw new Error(`${event.type} accepted`);
  return result.reason;
};

/** A plan of these steps, appended to the empty plan in one event */
export const planOf = (
  steps: readonly NewStep[],
  deadlines: Partial<StepPlanRecord["deadlines"]> = {},
) => accept(emptyPlan(deadlines), { type: "steps", steps });

/** The step with this name */
export const stepOf = (json: StepPlanRecord, name: string): StepRecord => {
  const step = json.steps.find((each) => each.name === name);
  if (step === undefined) throw new Error(`no step ${name}`);
  return step;
};

/* ---------------------------------------------------------------------------------------------
 * Real transactions
 * ------------------------------------------------------------------------------------------- */

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];

/** The end of validity of the real steps that have one */
export const UNTIL = Date.UTC(2030, 0, 1);

/** A witness of the key over the transaction, as a signer gives it */
export const signedBy = (key: TestKey, txHash: string): KeyWitness => ({
  kind: "vkey",
  vkey: key.vkey,
  signature: key.sign(txHash),
  keyHash: key.keyHash,
});

/**
 * Real transactions of a plan, built offline: `a` pays from the first payer's only UTxO; `b`
 * spends the change of `a`; `c` pays from a second payer and has no end of validity; `d` spends
 * the change of `b` and reads the output `c` makes; `e`, for appending, spends the change of `d`
 */
export const realSteps = async () => {
  await Crypto.ready();
  const builder = new TxBuilder({ network: "preprod", params, costModels });
  const first = testKey();
  const second = testKey();
  const recipient = baseAddress(2);
  const fund = (key: TestKey, n: number): Utxo => ({
    txHash: hash(0xd000 + n),
    outputIndex: 0,
    address: key.address,
    value: { lovelace: 100_000_000n },
  });
  const pay = (lovelace: bigint, label?: string) =>
    output({
      address: recipient,
      value: { lovelace },
      ...(label !== undefined && { label }),
    });
  const payer = { changeAddress: first.address, utxos: [fund(first, 1)] };
  const until = validity({ until: UNTIL });

  const a = await builder.build([pay(5_000_000n, "x"), until], { payer });
  const b = await builder.build(
    [spend.pubKey({ utxo: a.change[0]! }), pay(3_000_000n), until],
    { payer, after: a },
  );
  const c = await builder.build(pay(4_000_000n, "read"), {
    payer: { changeAddress: second.address, utxos: [fund(second, 2)] },
  });
  const d = await builder.build(
    [
      spend.pubKey({ utxo: b.change[0]! }),
      referenceInput({ utxo: c.outputs[0]! }),
      pay(2_000_000n),
      until,
    ],
    { payer, after: [a, b, c] },
  );
  const e = await builder.build(
    [spend.pubKey({ utxo: d.change[0]! }), pay(1_000_000n), until],
    { payer, after: [a, b, c, d] },
  );
  const steps: NewStep[] = [
    {
      name: "a",
      built: a,
      standsOn: [],
      given: { parts: [pay(5_000_000n, "x")] },
    },
    {
      name: "b",
      built: b,
      standsOn: ["a"],
      given: {
        parts: [
          spend.pubKey({ utxo: { step: "a", change: true } }),
          pay(3_000_000n),
        ],
        options: { fee: 400_000n, changeAddress: first.address },
      },
    },
    { name: "c", kind: "consolidation", built: c, standsOn: [] },
    {
      name: "d",
      built: d,
      standsOn: ["b", "c"],
      given: {
        parts: [
          spend.pubKey({ utxo: { step: "b", output: 1 } }),
          referenceInput({ utxo: { step: "c", output: "read" } }),
          pay(2_000_000n),
        ],
      },
    },
  ];
  const extra: NewStep = { name: "e", built: e, standsOn: ["d"] };
  const keys: Record<string, TestKey> = {
    a: first,
    b: first,
    c: second,
    d: first,
    e: first,
  };
  return { builder, first, second, steps, extra, keys };
};
