import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { bech32 } from "bech32";

import type { IFetcher } from "@meshsdk/common";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/core";

import type { TxPlanError } from "../../../src/tx-builder";
import type { TxPlan } from "../../../src/tx-builder/plan/plan";
import {
  output,
  TxBuilder,
  TxBuildError,
  TxError,
} from "../../../src/tx-builder";
import { baseAddress } from "../../test-util";
import { caught, FAST, pay, setup } from "./plan-emulator-util";

const A = output({
  label: "A",
  address: baseAddress(3),
  value: { lovelace: 2_000_000n },
});
const B = output({
  label: "B",
  address: baseAddress(4),
  value: { lovelace: 3_000_000n },
});
const C = output({
  label: "C",
  address: baseAddress(5),
  value: { lovelace: 4_000_000n },
});

/** A provider that answers nothing, counting every call, and has the members it is given */
const countingProvider = (members: Record<string, unknown> = {}) => {
  const calls: string[] = [];
  const answer = (name: string) => async () => {
    calls.push(name);
    throw new Error(`${name} is not answered here`);
  };
  const provider = Object.fromEntries(
    [
      "fetchAccountInfo",
      "fetchAddressUTxOs",
      "fetchAddressTxs",
      "fetchAssetAddresses",
      "fetchAssetMetadata",
      "fetchBlockInfo",
      "fetchCollectionAssets",
      "fetchProtocolParameters",
      "fetchTxInfo",
      "fetchUTxOs",
      "fetchGovernanceProposal",
      "fetchLatestBlock",
      "get",
      "submitTx",
    ].map((name) => [name, answer(name)]),
  );
  return {
    provider: { ...provider, ...members } as unknown as IFetcher,
    calls,
  };
};

const invalidOption = async (run: () => unknown) => {
  const error = await caught((async () => run())());
  expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
  expect(error).toBeInstanceOf(TxBuildError);
  return error as TxBuildError<"INVALID_OPTION">;
};

/** The labels of the outputs of the step main, change left out */
const labelsOf = (plan: TxPlan) =>
  plan
    .step("main")
    .outputs.filter((o) => o.change !== true)
    .map((o) => o.label);

/** A plan of one payment on the emulator, with the count of every request made after it */
const madePlan = async () => {
  const { provider, builder, wallet } = await setup();
  const plan = await builder.plan(pay(), { payer: wallet });
  const all = () =>
    Object.values(provider.control.calls).reduce((sum, n) => sum + n, 0);
  const before = all();
  return { plan, wallet, requests: () => all() - before };
};

describe("TxBuilder.plan", () => {
  it("takes the parts the builder holds first, in their order, and skips false, null and nesting", async () => {
    const { builder, wallet } = await setup();
    const held = builder.add(A);
    const plan = await held.plan([[B, false], null], { payer: wallet });
    expect(labelsOf(plan)).toEqual(["A", "B"]);
    // A later builder and its plans do not touch this plan's parts
    const later = held.add(C);
    expect(labelsOf(await later.plan(B, { payer: wallet }))).toEqual([
      "A",
      "C",
      "B",
    ]);
    expect(labelsOf(plan)).toEqual(["A", "B"]);
    expect(labelsOf(await held.plan([], { payer: wallet }))).toEqual(["A"]);
  });

  it("is CANNOT_OBSERVE (noTip) without a tip to read, before any other request", async () => {
    const { provider, calls } = countingProvider({
      fetchLatestBlock: undefined,
    });
    for (const builder of [
      new TxBuilder({ network: "preprod", provider }),
      new TxBuilder({
        network: "preprod",
        params: { ...DEFAULT_PROTOCOL_PARAMETERS },
      }),
    ]) {
      const error = (await caught(
        builder.plan(pay(), { id: "no-tip", payer: baseAddress(9) }),
      )) as TxPlanError<"CANNOT_OBSERVE">;
      expect(TxError.is(error, "CANNOT_OBSERVE")).toBe(true);
      expect(error.details.reason).toBe("noTip");
      expect(error.retryable).toBe(false);
      expect(error.planId).toBe("no-tip");
      expect(error.plan).toBeUndefined();
    }
    expect(calls).toEqual([]);
  });

  it.each([
    { options: { ttlMs: 0 }, option: "ttlMs" },
    { options: { ttlMs: NaN }, option: "ttlMs" },
    { options: { expiryMarginMs: -1 }, option: "expiryMarginMs" },
    { options: { confirmations: 1.5 }, option: "confirmations" },
    { options: { confirmations: -1 }, option: "confirmations" },
    { options: { id: 5 }, option: "id" },
  ])(
    "refuses $option out of range before any request",
    async ({ options, option }) => {
      const { provider, calls } = countingProvider();
      const builder = new TxBuilder({ network: "preprod", provider });
      const error = await invalidOption(() =>
        builder.plan(pay(), { payer: baseAddress(9), ...options } as never),
      );
      expect(error.details.option).toBe(option);
      expect(calls).toEqual([]);
    },
  );

  it("refuses an entry that is not a part before any request", async () => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const error = await invalidOption(() =>
      builder.plan([pay(), 5 as never], { payer: baseAddress(9) }),
    );
    expect(error.details.option).toBe("parts");
    expect(calls).toEqual([]);
  });

  it("works out its deadlines once: its own, else the builder's, else the built-in values", async () => {
    const { provider, builder: fast, wallet } = await setup();
    const plain = new TxBuilder({ network: "preprod", provider });
    expect(
      (await plain.plan(pay(), { payer: wallet })).toJSON().deadlines,
    ).toEqual({
      ttlMs: 600_000,
      expiryMarginMs: 600_000,
      confirmations: 30,
    });
    const builder = new TxBuilder({
      network: "preprod",
      provider,
      planDefaults: { ttlMs: 120_000, confirmations: 5, pollMs: 50 },
    });
    const plan = await builder.plan(pay(), {
      payer: wallet,
      confirmations: 2,
      expiryMarginMs: 1_000,
    });
    expect(plan.toJSON().deadlines).toEqual({
      ttlMs: 120_000,
      expiryMarginMs: 1_000,
      confirmations: 2,
    });
    expect(
      (await builder.plan(pay(), { payer: wallet })).toJSON().deadlines,
    ).toEqual({ ttlMs: 120_000, expiryMarginMs: 600_000, confirmations: 5 });
    // `add` carries the defaults on
    expect(
      (await builder.add(A).plan(B, { payer: wallet })).toJSON().deadlines,
    ).toEqual({ ttlMs: 120_000, expiryMarginMs: 600_000, confirmations: 5 });
    expect(
      (await fast.plan(pay(), { payer: wallet })).toJSON().deadlines,
    ).toEqual({
      ttlMs: 600_000,
      expiryMarginMs: FAST.expiryMarginMs,
      confirmations: FAST.confirmations,
    });
    // New defaults on the plan's own builder change nothing it holds
    Object.defineProperty(builder, "planDefaults", {
      value: Object.freeze({ ttlMs: 1_000, confirmations: 0 }),
    });
    expect(plan.toJSON().deadlines).toEqual({
      ttlMs: 120_000,
      expiryMarginMs: 1_000,
      confirmations: 2,
    });
  });

  it("writes the data options, the network and the id into its record, and never a live object", async () => {
    const { builder, wallet, address } = await setup();
    const canSelect = () => true;
    const trace = () => undefined;
    const plan = await builder.plan(pay(), {
      id: "pay-2",
      payer: wallet,
      canSelect,
      trace,
      fee: 300_000n,
      extraKeyWitnesses: 1,
    });
    const record = plan.toJSON();
    expect(record).toMatchObject({
      kind: "TxPlan",
      id: "pay-2",
      rev: 1,
      status: "pending",
      network: "preprod",
      options: { changeAddress: address, extraKeyWitnesses: 1 },
    });
    // The fee describes one transaction: it is the step's own option
    expect(record.steps[0]!.given).toMatchObject({
      options: { fee: "300000" },
    });
    // Plain JSON data: text gives it back member for member
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
    const text = inspect(record, { depth: Infinity });
    expect(text).not.toContain("[Function");
    expect(text).not.toContain("MeshWallet");
  });

  it("checks the wait options of run() before any request", async () => {
    const { plan, requests } = await madePlan();
    for (const [options, option] of [
      [{ waitFor: "landed" }, "waitFor"],
      [{ timeoutMs: 0 }, "timeoutMs"],
      [{ pollMs: -1 }, "pollMs"],
      [{ pollMs: NaN }, "pollMs"],
      [{ submitter: {} }, "submitter"],
      [{ signers: [{}] }, "signers"],
      [{ signal: {} }, "signal"],
    ] as const) {
      const error = await invalidOption(() => plan.run(options as never));
      expect(error.details.option).toBe(option);
    }
    expect(requests()).toBe(0);
    expect(plan.step("main").status).toBe("built");
  });

  describe("a value given as signers that cannot sign", () => {
    // Keys made for this test only; a failed check prints booleans, never a key
    const key = randomBytes(32).toString("hex");
    const bech32Key = bech32.encode(
      "ed25519_sk",
      bech32.toWords(Buffer.from(key, "hex")),
    );
    const cases: [string, unknown, string, string[]][] = [
      ["a key in hex", key, "string", [key, key.toUpperCase()]],
      ["a key in bech32", bech32Key, "string", [bech32Key]],
      ["a list holding a key", [key], "object", [key]],
      ["an object holding a key", { privateKey: key }, "object", [key]],
    ];

    /** Every text an error shows: its message, stack, details and cause, as printed and as JSON */
    const textsOf = (error: TxBuildError) => [
      error.message,
      String(error.stack),
      JSON.stringify(error.details),
      JSON.stringify(error),
      inspect(error, { depth: Infinity, showHidden: true }),
    ];

    it.each(cases)(
      "refuses %s in sign() and run(), naming only its type",
      async (_, signers, type, secrets) => {
        const { plan, requests } = await madePlan();
        for (const method of ["sign", "run"] as const) {
          const error = await invalidOption(() =>
            plan[method]({ signers } as never),
          );
          expect(error.details.option).toBe("signers");
          expect(error.details.allowed).toBe(
            "a signer (signTxWitnesses, signTxHash, signTx, or a function that signs a transaction hash), or a list of them",
          );
          // Compared as a boolean: on a failure the value given is not printed
          expect(error.details.value === type).toBe(true);
          expect(error.cause).toBeUndefined();
          const shown = textsOf(error).filter((text) =>
            secrets.some((secret) => text.includes(secret)),
          );
          expect(shown.length).toBe(0);
        }
        expect(requests()).toBe(0);
        expect(plan.step("main").status).toBe("built");
      },
    );

    it("names the type of the entry of a list that cannot sign", async () => {
      const { plan } = await madePlan();
      const wallet = { signTxWitnesses: async () => "a0" };
      const error = await invalidOption(() =>
        plan.sign({ signers: [wallet, key] as never }),
      );
      expect(error.message.includes("a list whose entry 1 is string")).toBe(
        true,
      );
      expect(error.details.value === "object").toBe(true);
      expect(error.message.includes(key)).toBe(false);
    });

    it("takes a function that has a wallet method as a wallet", async () => {
      const { plan, wallet } = await madePlan();
      let asked = 0;
      const signer = Object.assign(() => undefined, {
        signTx: async (tx: string) => {
          asked += 1;
          return wallet.signTx(tx, true);
        },
      });
      await plan.sign({ signers: signer });
      expect(asked).toBe(1);
      expect(plan.step("main").status).toBe("signed");
    });

    it("takes a bare function as a signer of transaction hashes", async () => {
      const { plan, requests } = await madePlan();
      let called = 0;
      const signer = async () => {
        called++;
        return [];
      };
      // Taken, and asked: it gives no witness, so the step stays built
      await plan.sign({ signers: signer });
      expect(called).toBe(1);
      expect(plan.step("main").status).toBe("built");
      const failed = await caught(
        plan.run({ signers: [signer], waitFor: "sent" }),
      );
      expect(TxError.is(failed, "MISSING_SIGNATURES")).toBe(true);
      expect(called).toBe(2);
      expect(plan.step("main").status).toBe("built");
      expect(requests()).toBeGreaterThan(0);
    });
  });

  it("stops a plan nothing of which was signed without a request, and signs nothing after", async () => {
    const { plan, requests, wallet } = await madePlan();
    expect(await plan.stop()).toBe(plan);
    expect(plan.status).toBe("stopping");
    expect(plan.toJSON().stopped).toBe(true);
    expect(plan.live.map((step) => step.name)).toEqual(["main"]);
    const rev = plan.toJSON().rev;
    // Stopped: the same call changes nothing, and sign() refuses at once
    expect(await plan.stop()).toBe(plan);
    expect(plan.toJSON().rev).toBe(rev);
    const error = (await caught(
      plan.sign({ signers: wallet }),
    )) as TxPlanError<"INVALID_STATE">;
    expect(TxError.is(error, "INVALID_STATE")).toBe(true);
    expect(error.details.reason).toBe("stopped");
    expect(plan.step("main").status).toBe("built");
    expect(requests()).toBe(0);
  });
});
