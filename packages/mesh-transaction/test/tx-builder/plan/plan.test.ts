import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { bech32 } from "bech32";

import type { IFetcher } from "@meshsdk/common";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/core";

import type { TxPlanError } from "../../../src/tx-builder";
import {
  output,
  TxBuilder,
  TxBuildError,
  TxError,
  TxPlan,
} from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { baseAddress } from "../../test-util";
import { caught, emulatorOf, FAST, pay, wrap } from "./plan-emulator-util";

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

describe("TxBuilder.plan", () => {
  it("takes the parts the builder holds first, and keeps them when the builder gets more", () => {
    const { provider } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const held = builder.add(A);
    const plan = held.plan(B);
    const later = held.add(C);
    expect(recordOf(plan).parts).toEqual([A, B]);
    // A later builder and its plans do not touch this plan's parts
    later.plan([]);
    expect(recordOf(plan).parts).toEqual([A, B]);
    expect(recordOf(held.plan()).parts).toEqual([A]);
    expect(recordOf(later.plan([[B, false], null])).parts).toEqual([A, C, B]);
  });

  it("returns a draft at once, without a request", () => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const plan = builder.plan(pay(), { id: "pay-1" });
    expect(plan).toBeInstanceOf(TxPlan);
    expect(calls).toEqual([]);
    expect(plan.id).toBe("pay-1");
    expect(plan.status).toBe("draft");
    expect(plan.built).toBeUndefined();
    expect(plan.signedTx).toBeUndefined();
    expect(plan.txHash).toBeUndefined();
    expect(plan.landed).toBeUndefined();
    expect(plan.attempts).toEqual([]);
    expect(plan.live).toEqual([]);
    expect(plan.missing).toEqual([]);
    expect(plan.closing).toBe(false);
    expect(builder.plan(pay()).id).toBeUndefined();
  });

  it("refuses a parent that is not a plan, at once", async () => {
    const emulator = await emulatorOf();
    const provider = wrap(emulator);
    const builder = new TxBuilder({ network: "preprod", provider });
    const built = await builder.build(pay(), {
      payer: {
        changeAddress: baseAddress(9),
        utxos: [emulator.fund(baseAddress(9), { lovelace: 50_000_000n })],
      },
    });
    const calls = provider.control.count(
      "fetchLatestBlock",
      "fetchTxInfo",
      "fetchAddressUTxOs",
    );
    const plan = builder.plan(pay());
    for (const after of [built, [plan, built], {}, "parent", null]) {
      const error = await invalidOption(() =>
        builder.plan(pay(), { after } as never),
      );
      expect(error.details.option).toBe("after");
    }
    // Plans are parents, alone or in a list
    expect(builder.plan(pay(), { after: plan }).status).toBe("draft");
    expect(builder.plan(pay(), { after: [plan] }).status).toBe("draft");
    expect(builder.plan(pay(), { after: [] }).status).toBe("draft");
    expect(
      provider.control.count(
        "fetchLatestBlock",
        "fetchTxInfo",
        "fetchAddressUTxOs",
      ),
    ).toBe(calls);
  });

  it("is CANNOT_OBSERVE (noTip) without a tip to read", async () => {
    const { provider } = countingProvider({ fetchLatestBlock: undefined });
    for (const builder of [
      new TxBuilder({ network: "preprod", provider }),
      new TxBuilder({
        network: "preprod",
        params: { ...DEFAULT_PROTOCOL_PARAMETERS },
      }),
    ]) {
      const error = (await caught(
        (async () => builder.plan(pay(), { id: "no-tip" }))(),
      )) as TxPlanError<"CANNOT_OBSERVE">;
      expect(TxError.is(error, "CANNOT_OBSERVE")).toBe(true);
      expect(error.details.reason).toBe("noTip");
      expect(error.retryable).toBe(false);
      expect(error.planId).toBe("no-tip");
      expect(error.plan).toBeUndefined();
    }
  });

  it("is CANNOT_OBSERVE (addressCache) for a provider that keeps an address cache", async () => {
    const cached = countingProvider({ isCachingEnabled: () => true });
    const error = (await caught(
      (async () =>
        new TxBuilder({ network: "preprod", provider: cached.provider }).plan(
          pay(),
        ))(),
    )) as TxPlanError<"CANNOT_OBSERVE">;
    expect(TxError.is(error, "CANNOT_OBSERVE")).toBe(true);
    expect(error.details.reason).toBe("addressCache");
    for (const members of [{ isCachingEnabled: () => false }, {}]) {
      const { provider } = countingProvider(members);
      expect(
        new TxBuilder({ network: "preprod", provider }).plan(pay()).status,
      ).toBe("draft");
    }
  });

  it.each([
    { options: { ttlMs: 0 }, option: "ttlMs" },
    { options: { ttlMs: NaN }, option: "ttlMs" },
    { options: { expiryMarginMs: -1 }, option: "expiryMarginMs" },
    { options: { confirmations: 1.5 }, option: "confirmations" },
    { options: { confirmations: -1 }, option: "confirmations" },
    { options: { id: 5 }, option: "id" },
  ])("refuses $option out of range, at once", async ({ options, option }) => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const error = await invalidOption(() =>
      builder.plan(pay(), options as never),
    );
    expect(error.details.option).toBe(option);
    expect(calls).toEqual([]);
  });

  it("refuses an entry that is not a part", async () => {
    const { provider } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const error = await invalidOption(() => builder.plan([pay(), 5 as never]));
    expect(error.details.option).toBe("parts");
  });

  it("works out its deadlines once: its own, else the builder's, else the built-in values", () => {
    const { provider } = countingProvider();
    const plain = new TxBuilder({ network: "preprod", provider });
    expect(recordOf(plain.plan(pay())).deadlines).toEqual({
      ttlMs: 600_000,
      expiryMarginMs: 600_000,
      confirmations: 30,
    });
    const builder = new TxBuilder({
      network: "preprod",
      provider,
      planDefaults: { ttlMs: 120_000, confirmations: 5, pollMs: 50 },
    });
    const plan = builder.plan(pay(), {
      confirmations: 2,
      expiryMarginMs: 1_000,
    });
    expect(recordOf(plan).deadlines).toEqual({
      ttlMs: 120_000,
      expiryMarginMs: 1_000,
      confirmations: 2,
    });
    expect(recordOf(builder.plan(pay())).deadlines).toEqual({
      ttlMs: 120_000,
      expiryMarginMs: 600_000,
      confirmations: 5,
    });
    // `add` carries the defaults on; a builder whose defaults differ changes no plan made
    // before: the plan holds the numbers it was made with
    expect(recordOf(builder.add(A).plan(B)).deadlines).toEqual(
      recordOf(builder.plan(B)).deadlines,
    );
    const other = builder.add(A);
    Object.defineProperty(other, "planDefaults", {
      value: Object.freeze({ ttlMs: 1_000, confirmations: 0 }),
    });
    expect(recordOf(other.plan(pay())).deadlines).toMatchObject({
      ttlMs: 1_000,
      confirmations: 0,
    });
    // New defaults on the plan's own builder change nothing it holds
    Object.defineProperty(builder, "planDefaults", {
      value: Object.freeze({ ttlMs: 1_000, confirmations: 0 }),
    });
    expect(recordOf(plan).deadlines).toEqual({
      ttlMs: 120_000,
      expiryMarginMs: 1_000,
      confirmations: 2,
    });
  });

  it("writes the data options, the network and the id into its record, and never a live object", () => {
    const { provider } = countingProvider();
    const builder = new TxBuilder({
      network: "preprod",
      provider,
      planDefaults: FAST,
    });
    const canSelect = () => true;
    const trace = () => undefined;
    const record = recordOf(
      builder.plan(pay(), {
        id: "pay-2",
        payer: baseAddress(9),
        canSelect,
        trace,
        fee: 300_000n,
        extraKeyWitnesses: 1,
      }),
    );
    expect(record).toMatchObject({
      kind: "TxPlan",
      id: "pay-2",
      rev: 0,
      status: "draft",
      network: "preprod",
      options: { fee: 300_000n, extraKeyWitnesses: 1 },
    });
    expect(
      JSON.stringify(record, (_, v) => (typeof v === "bigint" ? `${v}` : v)),
    ).not.toContain(baseAddress(9));
    expect(Object.values(record.options)).not.toContain(canSelect);
    expect(Object.values(record.options)).not.toContain(trace);
  });

  it("makes no request from refresh() in draft", async () => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const plan = builder.plan(pay(), { payer: baseAddress(9) });
    expect(await plan.refresh()).toBe(plan);
    expect(calls).toEqual([]);
    expect(plan.status).toBe("draft");
  });

  it("checks the wait options of send() and advance() before any request", async () => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const plan = builder.plan(pay(), { payer: baseAddress(9) });
    for (const method of ["send", "advance"] as const)
      for (const [options, option] of [
        [{ waitFor: "landed" }, "waitFor"],
        [{ timeoutMs: 0 }, "timeoutMs"],
        [{ pollMs: -1 }, "pollMs"],
        [{ pollMs: NaN }, "pollMs"],
        [{ submitter: {} }, "submitter"],
        [{ signers: [{}] }, "signers"],
        [{ signal: {} }, "signal"],
      ] as const) {
        const error = await invalidOption(() => plan[method](options as never));
        expect(error.details.option).toBe(option);
      }
    expect(calls).toEqual([]);
    expect(plan.status).toBe("draft");
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
      "refuses %s in sign(), send() and advance(), naming only its type",
      async (_, signers, type, secrets) => {
        const { provider, calls } = countingProvider();
        const builder = new TxBuilder({ network: "preprod", provider });
        const plan = builder.plan(pay(), { payer: baseAddress(9) });
        for (const method of ["sign", "send", "advance"] as const) {
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
        expect(calls).toEqual([]);
        expect(plan.status).toBe("draft");
      },
    );

    it("names the type of the entry of a list that cannot sign", async () => {
      const { provider } = countingProvider();
      const builder = new TxBuilder({ network: "preprod", provider });
      const plan = builder.plan(pay(), { payer: baseAddress(9) });
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

    it("takes a function that has a wallet method as a signer", async () => {
      const { provider } = countingProvider();
      const builder = new TxBuilder({ network: "preprod", provider });
      const plan = builder.plan(pay(), { payer: baseAddress(9) });
      const signer = Object.assign(() => undefined, {
        signTx: async () => "",
      });
      // The signer is taken: the call goes on to the draft, which has no attempt to sign
      const error = await caught(plan.sign({ signers: signer }));
      expect(TxError.is(error, "INVALID_STATE")).toBe(true);
    });

    it("takes a bare function as a signer of transaction hashes, without calling it", async () => {
      const { provider } = countingProvider();
      const builder = new TxBuilder({ network: "preprod", provider });
      const plan = builder.plan(pay(), { payer: baseAddress(9) });
      let called = 0;
      const signer = async () => {
        called++;
        return [];
      };
      // The signer is taken: the call goes on to the draft, which has no attempt to sign
      const error = await caught(plan.sign({ signers: signer }));
      expect(TxError.is(error, "INVALID_STATE")).toBe(true);
      for (const method of ["send", "advance"] as const) {
        const failed = await caught(plan[method]({ signers: [signer] }));
        expect(TxError.is(failed, "INVALID_OPTION")).toBe(false);
      }
      expect(called).toBe(0);
    });
  });

  it("closes a draft at once, without a request", async () => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const plan = builder.plan(pay(), { payer: baseAddress(9) });
    expect(await plan.abandon()).toBe(plan);
    expect(plan.status).toBe("abandoned");
    expect(plan.closing).toBe(true);
    expect(plan.built).toBeUndefined();
    expect(plan.live).toEqual([]);
    // Closed: the same call, and advance(), return at once
    expect(await plan.abandon()).toBe(plan);
    expect(await plan.advance()).toBe(plan);
    expect(calls).toEqual([]);
  });

  it("refuses a plan without an attempt as after of builder.build(), before any request", async () => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const draft = builder.plan(pay(), { payer: baseAddress(9) });
    const closed = builder.plan(pay(), { payer: baseAddress(9) });
    await closed.abandon();
    for (const after of [draft, [closed]]) {
      const error = await invalidOption(() =>
        builder.build(pay(), {
          payer: baseAddress(9),
          after: after as never,
        }),
      );
      expect(error.details.option).toBe("after");
      expect(["draft", "abandoned"]).toContain(error.details.value);
      expect(error.details.value).not.toBeInstanceOf(TxPlan);
    }
    expect(calls).toEqual([]);
  });
});
