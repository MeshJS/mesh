import { inspect } from "node:util";

import type { TxBuildError } from "../../../src/tx-builder";
import { TxBuildError as TxBuildErrorClass } from "../../../src/tx-builder";
import { cip30Wallet } from "../../cip30-wallet";
import {
  caught,
  hashOf,
  pay,
  setup,
  submitterOf,
  words,
} from "./plan-emulator-util";
import { watchStore } from "./store-util";

// The options of a plan's calls: what is not an object, a signer or a submitter given in their
// place, and a member the call does not know are INVALID_OPTION before anything is asked,
// written or sent.

const SIGN_ALLOWED = "an object { signers?, signal? }";
const RUN_ALLOWED =
  "an object { signers?, submitter?, waitFor?, timeoutMs?, pollMs?, signal? }";

/** A member name no message may show */
const LONG_NAME = "ab".repeat(32);

/** A plan over a store, with a payer, signers and submitters that count their requests */
const builtPlan = async () => {
  const store = watchStore();
  // The builder's submitter passes the bytes on to the emulator, made after it
  const chain: { submitTx?: (tx: string) => Promise<string> } = {};
  const own = submitterOf((tx) => chain.submitTx!(tx));
  const { builder, emulator, provider } = await setup({
    builder: { store, submitter: own },
  });
  chain.submitTx = (tx) => emulator.submitTx(tx);
  const api = await cip30Wallet({ words, fetcher: emulator });
  const asked = { payer: 0, named: 0 };
  const payer = {
    ...api,
    signTx: (tx: string) => {
      asked.payer += 1;
      return api.signTx(tx);
    },
  };
  const named = {
    signTx: (tx: string) => {
      asked.named += 1;
      return api.signTx(tx);
    },
  };
  const callback = async () => {
    asked.named += 1;
    return [];
  };
  const given = submitterOf(hashOf);
  const plan = await builder.plan(pay(), { id: "pay", payer });
  store.reset();
  const before = plan.toJSON();
  /** Nobody was asked, nothing was written and nothing was sent */
  const untouched = () => {
    expect(asked).toEqual({ payer: 0, named: 0 });
    expect(plan.toJSON()).toStrictEqual(before);
    expect(store.calls.filter((call) => call.op === "save")).toEqual([]);
    expect([own.calls, given.calls]).toEqual([[], []]);
    expect(provider.control.count("submitTx")).toBe(0);
  };
  return { plan, payer, named, callback, given, asked, untouched, own };
};

type Fixture = Awaited<ReturnType<typeof builtPlan>>;

/**
 * A case: its name, the options it gives, the type `details.value` names, and what the message
 * says: a hint, the unknown member shown, or `null` for an unknown member not shown
 */
type Case = readonly [
  name: string,
  options: (fixture: Fixture) => unknown,
  type: string,
  says: { hint: string } | { member: string | null } | undefined,
];

const SIGNER_CASES: readonly Case[] = [
  ["null", () => null, "null", undefined],
  [
    "a text",
    () => "ed25519_sk1",
    "string",
    { hint: "a private key is given as { signers: keySigner(key) }" },
  ],
  [
    "a signer",
    ({ named }) => named,
    "object",
    { hint: "a signer is given as { signers }" },
  ],
  [
    "a signer that is a function",
    ({ callback }) => callback,
    "function",
    { hint: "a signer is given as { signers }" },
  ],
  [
    "a list of signers",
    ({ named }) => [named],
    "object",
    { hint: "signers are given as { signers: [...] }" },
  ],
  [
    "{ signer }",
    ({ named }) => ({ signer: named }),
    "object",
    { member: "signer" },
  ],
  [
    "a member named by a 64-digit hex text",
    () => ({ [LONG_NAME]: true }),
    "object",
    { member: null },
  ],
  [
    "a symbol member",
    () => ({ [Symbol("signers")]: [] }),
    "object",
    { member: null },
  ],
];

const SIGN_CASES: readonly Case[] = [
  ...SIGNER_CASES,
  [
    "{ submitter }",
    ({ given }) => ({ submitter: given }),
    "object",
    { member: "submitter" },
  ],
  [
    '{ waitFor: "included" }',
    () => ({ waitFor: "included" }),
    "object",
    { member: "waitFor" },
  ],
];

const RUN_CASES: readonly Case[] = [
  ...SIGNER_CASES,
  [
    "a submitter",
    ({ given }) => given,
    "object",
    { hint: "a submitter is given as { submitter }" },
  ],
  [
    "{ submiter }",
    ({ given }) => ({ submiter: given }),
    "object",
    { member: "submiter" },
  ],
  [
    '{ waitfor: "included" }',
    () => ({ waitfor: "included" }),
    "object",
    { member: "waitfor" },
  ],
  ["{ timeout: 1 }", () => ({ timeout: 1 }), "object", { member: "timeout" }],
];

const expectRefused = (
  error: unknown,
  allowed: string,
  type: string,
  says: Case[3],
) => {
  expect(TxBuildErrorClass.is(error, "INVALID_OPTION")).toBe(true);
  const { details, message } = error as TxBuildError<"INVALID_OPTION">;
  expect(details).toStrictEqual({ option: "options", value: type, allowed });
  expect(message).toContain(`invalid options: expected ${allowed}`);
  if (says !== undefined && "hint" in says)
    expect(message).toContain(says.hint);
  if (says !== undefined && "member" in says)
    expect(message).toContain(
      says.member === null
        ? "an unknown member"
        : `the unknown member ${says.member}`,
    );
  expect(
    inspect(error, { depth: Infinity, showHidden: true }).includes(LONG_NAME),
  ).toBe(false);
};

describe("TxPlan on TxEmulator: options a call does not take", () => {
  describe.each([
    ["sign", SIGN_ALLOWED, SIGN_CASES],
    ["run", RUN_ALLOWED, RUN_CASES],
  ] as const)("%s()", (call, allowed, cases) => {
    it.each(cases)(
      "refuses %s: the payer is not asked, nothing is written or sent",
      async (_, options, type, says) => {
        const fixture = await builtPlan();
        const { plan, untouched, asked, own } = fixture;
        const method = plan[call].bind(plan) as (
          o: unknown,
        ) => Promise<unknown>;
        expectRefused(
          await caught(method(options(fixture))),
          allowed,
          type,
          says,
        );
        untouched();
        // Without options the payer signs, and run() sends and waits for a block
        await method(undefined);
        expect(asked.payer).toBe(1);
        expect(plan.step("main").status).toBe(
          call === "sign" ? "signed" : "final",
        );
        expect(own.calls).toHaveLength(call === "sign" ? 0 : 1);
      },
    );
  });
});
