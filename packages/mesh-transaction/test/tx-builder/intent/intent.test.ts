import type { IFetcher } from "@meshsdk/common";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/core";

import type { TxIntentError } from "../../../src/tx-builder";
import {
  output,
  TxBuilder,
  TxBuildError,
  TxError,
  TxIntent,
} from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/intent/intent";
import { baseAddress } from "../../test-util";
import { caught, emulatorOf, FAST, pay, wrap } from "./intent-emulator-util";

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

describe("TxBuilder.intent", () => {
  it("takes the parts the builder holds first, and keeps them when the builder gets more", () => {
    const { provider } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const held = builder.add(A);
    const intent = held.intent(B);
    const later = held.add(C);
    expect(recordOf(intent).parts).toEqual([A, B]);
    // A later builder and its intents do not touch this intent's parts
    later.intent([]);
    expect(recordOf(intent).parts).toEqual([A, B]);
    expect(recordOf(held.intent()).parts).toEqual([A]);
    expect(recordOf(later.intent([[B, false], null])).parts).toEqual([A, C, B]);
  });

  it("returns a draft at once, without a request", () => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const intent = builder.intent(pay(), { id: "pay-1" });
    expect(intent).toBeInstanceOf(TxIntent);
    expect(calls).toEqual([]);
    expect(intent.id).toBe("pay-1");
    expect(intent.status).toBe("draft");
    expect(intent.built).toBeUndefined();
    expect(intent.signedTx).toBeUndefined();
    expect(intent.txHash).toBeUndefined();
    expect(intent.landed).toBeUndefined();
    expect(intent.attempts).toEqual([]);
    expect(intent.live).toEqual([]);
    expect(intent.missing).toEqual([]);
    expect(intent.closing).toBe(false);
    expect(builder.intent(pay()).id).toBeUndefined();
  });

  it("refuses a parent that is not an intent, at once", async () => {
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
    const intent = builder.intent(pay());
    for (const after of [built, [intent, built], {}, "parent", null]) {
      const error = await invalidOption(() =>
        builder.intent(pay(), { after } as never),
      );
      expect(error.details.option).toBe("after");
    }
    // Intents are parents, alone or in a list
    expect(builder.intent(pay(), { after: intent }).status).toBe("draft");
    expect(builder.intent(pay(), { after: [intent] }).status).toBe("draft");
    expect(builder.intent(pay(), { after: [] }).status).toBe("draft");
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
        (async () => builder.intent(pay(), { id: "no-tip" }))(),
      )) as TxIntentError<"CANNOT_OBSERVE">;
      expect(TxError.is(error, "CANNOT_OBSERVE")).toBe(true);
      expect(error.details.reason).toBe("noTip");
      expect(error.retryable).toBe(false);
      expect(error.intentId).toBe("no-tip");
      expect(error.intent).toBeUndefined();
    }
  });

  it("is CANNOT_OBSERVE (addressCache) for a provider that keeps an address cache", async () => {
    const cached = countingProvider({ isCachingEnabled: () => true });
    const error = (await caught(
      (async () =>
        new TxBuilder({ network: "preprod", provider: cached.provider }).intent(
          pay(),
        ))(),
    )) as TxIntentError<"CANNOT_OBSERVE">;
    expect(TxError.is(error, "CANNOT_OBSERVE")).toBe(true);
    expect(error.details.reason).toBe("addressCache");
    for (const members of [{ isCachingEnabled: () => false }, {}]) {
      const { provider } = countingProvider(members);
      expect(
        new TxBuilder({ network: "preprod", provider }).intent(pay()).status,
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
      builder.intent(pay(), options as never),
    );
    expect(error.details.option).toBe(option);
    expect(calls).toEqual([]);
  });

  it("refuses an entry that is not a part", async () => {
    const { provider } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const error = await invalidOption(() =>
      builder.intent([pay(), 5 as never]),
    );
    expect(error.details.option).toBe("parts");
  });

  it("works out its deadlines once: its own, else the builder's, else the built-in values", () => {
    const { provider } = countingProvider();
    const plain = new TxBuilder({ network: "preprod", provider });
    expect(recordOf(plain.intent(pay())).deadlines).toEqual({
      ttlMs: 600_000,
      expiryMarginMs: 600_000,
      confirmations: 30,
    });
    const builder = new TxBuilder({
      network: "preprod",
      provider,
      intentDefaults: { ttlMs: 120_000, confirmations: 5, pollMs: 50 },
    });
    const intent = builder.intent(pay(), {
      confirmations: 2,
      expiryMarginMs: 1_000,
    });
    expect(recordOf(intent).deadlines).toEqual({
      ttlMs: 120_000,
      expiryMarginMs: 1_000,
      confirmations: 2,
    });
    expect(recordOf(builder.intent(pay())).deadlines).toEqual({
      ttlMs: 120_000,
      expiryMarginMs: 600_000,
      confirmations: 5,
    });
    // `add` carries the defaults on; a builder whose defaults differ changes no intent made
    // before: the intent holds the numbers it was made with
    expect(recordOf(builder.add(A).intent(B)).deadlines).toEqual(
      recordOf(builder.intent(B)).deadlines,
    );
    const other = builder.add(A);
    Object.defineProperty(other, "intentDefaults", {
      value: Object.freeze({ ttlMs: 1_000, confirmations: 0 }),
    });
    expect(recordOf(other.intent(pay())).deadlines).toMatchObject({
      ttlMs: 1_000,
      confirmations: 0,
    });
    // New defaults on the intent's own builder change nothing it holds
    Object.defineProperty(builder, "intentDefaults", {
      value: Object.freeze({ ttlMs: 1_000, confirmations: 0 }),
    });
    expect(recordOf(intent).deadlines).toEqual({
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
      intentDefaults: FAST,
    });
    const canSelect = () => true;
    const trace = () => undefined;
    const record = recordOf(
      builder.intent(pay(), {
        id: "pay-2",
        payer: baseAddress(9),
        canSelect,
        trace,
        fee: 300_000n,
        extraKeyWitnesses: 1,
      }),
    );
    expect(record).toMatchObject({
      kind: "TxIntent",
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
    const intent = builder.intent(pay(), { payer: baseAddress(9) });
    expect(await intent.refresh()).toBe(intent);
    expect(calls).toEqual([]);
    expect(intent.status).toBe("draft");
  });

  it("checks the wait options of send() and advance() before any request", async () => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const intent = builder.intent(pay(), { payer: baseAddress(9) });
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
        const error = await invalidOption(() =>
          intent[method](options as never),
        );
        expect(error.details.option).toBe(option);
      }
    expect(calls).toEqual([]);
    expect(intent.status).toBe("draft");
  });

  it("closes a draft at once, without a request", async () => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const intent = builder.intent(pay(), { payer: baseAddress(9) });
    expect(await intent.abandon()).toBe(intent);
    expect(intent.status).toBe("abandoned");
    expect(intent.closing).toBe(true);
    expect(intent.built).toBeUndefined();
    expect(intent.live).toEqual([]);
    // Closed: the same call, and advance(), return at once
    expect(await intent.abandon()).toBe(intent);
    expect(await intent.advance()).toBe(intent);
    expect(calls).toEqual([]);
  });

  it("refuses an intent without an attempt as after of builder.build(), before any request", async () => {
    const { provider, calls } = countingProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    const draft = builder.intent(pay(), { payer: baseAddress(9) });
    const closed = builder.intent(pay(), { payer: baseAddress(9) });
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
      expect(error.details.value).not.toBeInstanceOf(TxIntent);
    }
    expect(calls).toEqual([]);
  });
});
