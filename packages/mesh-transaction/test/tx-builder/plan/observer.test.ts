import { jest } from "@jest/globals";

import {
  BlockInfo,
  CachedFetcher,
  IFetcher,
  ProviderError,
  TransactionInfo,
  UTxO,
} from "@meshsdk/core";
import { TxEmulator } from "@meshsdk/tx-emulator";

import { output, TxBuilder } from "../../../src/tx-builder";
import {
  chainObserver,
  errorFact,
  isRefusal,
  keepsAddressCache,
  searchThenTip,
} from "../../../src/tx-builder/plan/observer";
import { baseAddress } from "../../test-util";
import { hash, utxo } from "./plan-util";

/** An output of `txHash` as a provider answers with it, a Mesh UTxO */
const meshUtxo = (txHash: string, outputIndex = 0) => {
  const { address, value } = utxo(txHash, outputIndex);
  return {
    input: { txHash, outputIndex },
    output: {
      address,
      amount: [{ unit: "lovelace", quantity: String(value.lovelace) }],
    },
  };
};

const HASH = hash(0xab);
const ADDRESS = baseAddress(1);

/** A provider whose reads are jest mocks; each answers as the test sets it */
const fakeProvider = (overrides: Partial<Record<string, unknown>> = {}) => {
  const provider = {
    fetchLatestBlock: jest.fn(
      async () => ({ slot: "100", height: 90 }) as BlockInfo,
    ),
    fetchTxInfo: jest.fn(
      async (h: string) =>
        ({
          hash: h,
          slot: "50",
          block: "b".repeat(64),
          blockHeight: 40,
          validContract: true,
        }) as TransactionInfo,
    ),
    fetchAddressUTxOs: jest.fn(async () => [meshUtxo(HASH)]),
    ...overrides,
  };
  return provider as typeof provider & IFetcher;
};

const preprodEmulator = () =>
  TxEmulator.create({ validator: "scalus", network: "preprod", slot: 1_000 });

describe("ChainObserver", () => {
  describe("an error of any read is unknown, never no", () => {
    it.each([
      new Error("boom"),
      new Error(JSON.stringify({ status: 404 })),
      "network down",
      { status: 500 },
      new ProviderError("slow", { kind: "unavailable", status: 503 }),
      new ProviderError("refused", { kind: "rejected", status: 400 }),
      undefined,
    ])("%p", async (thrown) => {
      const fail = async () => {
        throw thrown;
      };
      const observer = chainObserver(
        fakeProvider({
          fetchLatestBlock: fail,
          fetchTxInfo: fail,
          fetchAddressUTxOs: fail,
        }),
      );
      expect(await observer.tip()).toBeUndefined();
      expect(await observer.findTx(HASH)).toBeUndefined();
      expect(await observer.utxosAt(ADDRESS)).toBeUndefined();
    });

    it("a read that throws at once is unknown too", async () => {
      const fail = () => {
        throw new Error("sync");
      };
      const observer = chainObserver(
        fakeProvider({
          fetchLatestBlock: fail,
          fetchTxInfo: fail,
          fetchAddressUTxOs: fail,
        }),
      );
      expect(await observer.tip()).toBeUndefined();
      expect(await observer.findTx(HASH)).toBeUndefined();
      expect(await observer.utxosAt(ADDRESS)).toBeUndefined();
    });

    it("so is a builder without a provider, or a provider without a tip", async () => {
      const none = chainObserver(undefined);
      expect(await none.tip()).toBeUndefined();
      expect(await none.findTx(HASH)).toBeUndefined();
      expect(await none.utxosAt(ADDRESS)).toBeUndefined();
      const noTip = fakeProvider({ fetchLatestBlock: undefined });
      expect(await chainObserver(noTip).tip()).toBeUndefined();
    });
  });

  it("takes an empty address list, or one that is not a list, as unknown", async () => {
    for (const answer of [[], undefined, null, {}, "[]"]) {
      const observer = chainObserver(
        fakeProvider({ fetchAddressUTxOs: async () => answer }),
      );
      expect(await observer.utxosAt(ADDRESS)).toBeUndefined();
    }
    const listed = [meshUtxo(HASH, 0), meshUtxo(HASH, 1)];
    const observer = chainObserver(
      fakeProvider({ fetchAddressUTxOs: async () => listed }),
    );
    expect(await observer.utxosAt(ADDRESS)).toStrictEqual([
      { txHash: HASH, outputIndex: 0 },
      { txHash: HASH, outputIndex: 1 },
    ]);
  });

  describe("reads only the out refs of an address list", () => {
    it("as two members, copied from the provider's answer", async () => {
      const held = {
        ...meshUtxo(HASH, 3),
        input: { txHash: HASH, outputIndex: 3, extra: "kept out" },
      };
      const observer = chainObserver(
        fakeProvider({ fetchAddressUTxOs: async () => [held] }),
      );
      const [ref] = (await observer.utxosAt(ADDRESS))!;
      expect(Object.keys(ref!)).toEqual(["txHash", "outputIndex"]);
      expect(ref).toStrictEqual({ txHash: HASH, outputIndex: 3 });
      expect(ref).not.toBe(held.input);
    });

    it("whatever the output of an entry holds", async () => {
      const observer = chainObserver(
        fakeProvider({
          fetchAddressUTxOs: async () => [
            { input: { txHash: HASH, outputIndex: 0 } },
          ],
        }),
      );
      expect(await observer.utxosAt(ADDRESS)).toStrictEqual([
        { txHash: HASH, outputIndex: 0 },
      ]);
    });

    const throwingInput = {
      get input(): never {
        throw new Error("getter");
      },
    };
    const throwingHash = {
      input: {
        get txHash(): never {
          throw new Error("getter");
        },
        outputIndex: 0,
      },
    };
    it.each([
      ["an entry that is not an object", null],
      ["an entry that is a string", "abc#0"],
      ["an entry without input", { output: meshUtxo(HASH).output }],
      ["an input that is not an object", { input: `${HASH}#0` }],
      ["an input without txHash", { input: { outputIndex: 0 } }],
      [
        "a txHash that is not a string",
        { input: { txHash: 7, outputIndex: 0 } },
      ],
      ["an input without outputIndex", { input: { txHash: HASH } }],
      [
        "an outputIndex that is not a number",
        { input: { txHash: HASH, outputIndex: "1" } },
      ],
      ["an input getter that throws", throwingInput],
      ["a txHash getter that throws", throwingHash],
    ])("is unknown with %s among readable entries", async (_what, entry) => {
      const observer = chainObserver(
        fakeProvider({
          fetchAddressUTxOs: async () => [
            meshUtxo(HASH, 0),
            entry,
            meshUtxo(HASH, 1),
          ],
        }),
      );
      expect(await observer.utxosAt(ADDRESS)).toBeUndefined();
    });

    it("is unknown with a hole in the list", async () => {
      const listed = [meshUtxo(HASH, 0), meshUtxo(HASH, 1), meshUtxo(HASH, 2)];
      delete listed[1];
      const observer = chainObserver(
        fakeProvider({ fetchAddressUTxOs: async () => listed }),
      );
      expect(await observer.utxosAt(ADDRESS)).toBeUndefined();
    });
  });

  it("searches and reads addresses past CachedFetcher", async () => {
    const provider = fakeProvider();
    // The builder's cache, which keeps a find and an address read for 10 s
    const cache = CachedFetcher.wrap(provider);
    await cache.fetchTxInfo(HASH);
    await cache.fetchAddressUTxOs(ADDRESS);
    expect(provider.fetchTxInfo).toHaveBeenCalledTimes(1);
    expect(provider.fetchAddressUTxOs).toHaveBeenCalledTimes(1);

    // Given the provider, or the cache itself as the builder's provider
    for (const given of [provider, cache]) {
      const observer = chainObserver(given);
      await observer.findTx(HASH);
      await observer.findTx(HASH);
      await observer.utxosAt(ADDRESS);
      await observer.utxosAt(ADDRESS);
    }
    // A second search within the 10 s reaches the provider
    expect(provider.fetchTxInfo).toHaveBeenCalledTimes(5);
    expect(provider.fetchAddressUTxOs).toHaveBeenCalledTimes(5);
  });

  it("reads the tip after every search has answered", async () => {
    const order: string[] = [];
    let release!: () => void;
    const slowSearch = new Promise<void>((resolve) => (release = resolve));
    const provider = fakeProvider({
      fetchTxInfo: async (h: string) => {
        order.push(`search ${h.slice(-2)}`);
        if (h === hash(1)) await slowSearch;
        order.push(`found ${h.slice(-2)}`);
        return { hash: h, slot: "5", blockHeight: 5 };
      },
      fetchLatestBlock: async () => {
        order.push("tip");
        return { slot: "10", height: 10 };
      },
    });
    const look = searchThenTip(chainObserver(provider), [hash(1), hash(2)]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(order).not.toContain("tip");
    release();
    const { searches, tip } = await look;
    expect(order).toEqual([
      "search 01",
      "search 02",
      "found 02",
      "found 01",
      "tip",
    ]);
    expect(tip).toEqual({ slot: 10, height: 10 });
    expect(searches.get(hash(1))).toEqual({
      found: true,
      slot: 5,
      blockHeight: 5,
    });
  });

  describe("the address cache", () => {
    it("makes an address read unknown while isCachingEnabled() answers true", async () => {
      let caching = false;
      const provider = fakeProvider({ isCachingEnabled: () => caching });
      const observer = chainObserver(provider);
      expect(await observer.utxosAt(ADDRESS)).toHaveLength(1);
      // Switched on after the observer was made: asked again before every read
      caching = true;
      expect(await observer.utxosAt(ADDRESS)).toBeUndefined();
      expect(provider.fetchAddressUTxOs).toHaveBeenCalledTimes(1);
      caching = false;
      expect(await observer.utxosAt(ADDRESS)).toHaveLength(1);
    });

    it("is asked of the provider behind a CachedFetcher", async () => {
      const provider = fakeProvider({ isCachingEnabled: () => true });
      const observer = chainObserver(new CachedFetcher(provider));
      expect(await observer.utxosAt(ADDRESS)).toBeUndefined();
      expect(provider.fetchAddressUTxOs).not.toHaveBeenCalled();
    });

    it.each([
      [() => true, true],
      [() => false, false],
      [() => "yes", false],
      [undefined, false],
      [true, false],
      [
        () => {
          throw new Error("cannot tell");
        },
        true,
      ],
    ])("isCachingEnabled %p: %p", (isCachingEnabled, keeps) => {
      const provider = fakeProvider({ isCachingEnabled });
      expect(keepsAddressCache(provider)).toBe(keeps);
      expect(keepsAddressCache(CachedFetcher.wrap(provider))).toBe(keeps);
    });
  });

  describe("the tip", () => {
    it("reads the slot as a number, and the height when it is a whole number from 0", async () => {
      const answers: [unknown, unknown][] = [
        [
          { slot: "100", height: 90 },
          { slot: 100, height: 90 },
        ],
        [
          { slot: 100, height: 0 },
          { slot: 100, height: 0 },
        ],
        [{ slot: "100" }, { slot: 100 }],
        [{ slot: "100", height: -1 }, { slot: 100 }],
        [{ slot: "100", height: 1.5 }, { slot: 100 }],
        [{ slot: "100", height: "90" }, { slot: 100 }],
        [{ slot: "100", height: NaN }, { slot: 100 }],
        [{ slot: "" }, undefined],
        [{ slot: "-1" }, undefined],
        [{ slot: "1e3" }, undefined],
        [{ slot: 1.5 }, undefined],
        [{ height: 1 }, undefined],
        [null, undefined],
        ["100", undefined],
      ];
      for (const [block, tip] of answers) {
        const observer = chainObserver(
          fakeProvider({ fetchLatestBlock: async () => block }),
        );
        expect(await observer.tip()).toEqual(tip);
      }
    });

    it("is unknown when older than a tip this observer has read", async () => {
      const slots = ["100", "99", "100", "101", "50"];
      const provider = fakeProvider({
        fetchLatestBlock: async () => ({ slot: slots.shift(), height: 1 }),
      });
      const observer = chainObserver(provider);
      expect((await observer.tip())?.slot).toBe(100);
      expect(await observer.tip()).toBeUndefined();
      expect((await observer.tip())?.slot).toBe(100);
      expect((await observer.tip())?.slot).toBe(101);
      expect(await observer.tip()).toBeUndefined();
      // Another observer has read nothing yet
      const fresh = chainObserver(
        fakeProvider({ fetchLatestBlock: async () => ({ slot: "50" }) }),
      );
      expect(await fresh.tip()).toEqual({ slot: 50 });
    });
  });

  describe("a search", () => {
    it("reads slot, block, blockHeight and validContract of a find", async () => {
      const answers: [unknown, unknown][] = [
        [
          {
            hash: HASH,
            slot: "50",
            block: "bb",
            blockHeight: 40,
            validContract: false,
          },
          {
            found: true,
            slot: 50,
            block: "bb",
            blockHeight: 40,
            validContract: false,
          },
        ],
        // Fields that are not of their type count as absent
        [
          {
            hash: HASH.toUpperCase(),
            slot: "x",
            block: 7,
            blockHeight: -3,
            validContract: "true",
          },
          { found: true },
        ],
        [{}, { found: true }],
        // An answer about another transaction says nothing about this one
        [{ hash: hash(0xcd), slot: "50" }, undefined],
        [null, undefined],
        ["found", undefined],
      ];
      for (const [info, search] of answers) {
        const observer = chainObserver(
          fakeProvider({ fetchTxInfo: async () => info }),
        );
        expect(await observer.findTx(HASH)).toEqual(search);
      }
    });

    it("answers not found and unsupported from what the provider throws", async () => {
      const throwing = (error: unknown) =>
        chainObserver(
          fakeProvider({
            fetchTxInfo: async () => {
              throw error;
            },
          }),
        );
      expect(
        await throwing(
          new ProviderError("none", { kind: "notFound", status: 404 }),
        ).findTx(HASH),
      ).toEqual({ found: false });
      expect(await throwing({ status: 404 }).findTx(HASH)).toEqual({
        found: false,
      });
      expect(
        await throwing(JSON.stringify({ status: 404, data: {} })).findTx(HASH),
      ).toEqual({ found: false });
      expect(
        await throwing(
          new ProviderError("no search", { kind: "unsupported" }),
        ).findTx(HASH),
      ).toEqual({ unsupported: true });
      // A refusal means nothing for a search
      expect(await throwing({ status: 400 }).findTx(HASH)).toBeUndefined();
      // A provider with no search at all
      expect(
        await chainObserver(fakeProvider({ fetchTxInfo: undefined })).findTx(
          HASH,
        ),
      ).toEqual({ unsupported: true });
    });
  });

  describe("on TxEmulator", () => {
    it("finds a transaction with its block, height and validity, and reads the tip", async () => {
      const emulator = await preprodEmulator();
      const funded = emulator.fund(ADDRESS, { lovelace: 10_000_000n });
      await emulator.advanceTo({ slot: 1_010 });
      const observer = chainObserver(emulator);
      const { searches, tip } = await searchThenTip(observer, [
        funded.input.txHash,
        hash(0xee),
      ]);
      expect(searches.get(funded.input.txHash)).toEqual({
        found: true,
        slot: 1_000,
        block: expect.any(String),
        blockHeight: 1_000,
        validContract: true,
      });
      expect(searches.get(hash(0xee))).toEqual({ found: false });
      expect(tip).toEqual({ slot: 1_010, height: 1_010 });
      expect(await observer.utxosAt(ADDRESS)).toStrictEqual([
        {
          txHash: funded.input.txHash,
          outputIndex: funded.input.outputIndex,
        },
      ]);
      // An address the ledger holds nothing at
      expect(await observer.utxosAt(baseAddress(9))).toBeUndefined();
    });
  });
});

describe("what a thrown value says", () => {
  it("reads the emulator's not found and refusal", async () => {
    const emulator = await preprodEmulator();
    const notFound = await emulator.fetchTxInfo(HASH).catch((e: unknown) => e);
    expect(errorFact(notFound)).toBe("notFound");

    // An unsigned transaction: the ledger refuses it for its missing witness
    const payer = {
      changeAddress: ADDRESS,
      utxos: [emulator.fund(ADDRESS, { lovelace: 10_000_000n })],
    };
    const builder = new TxBuilder({ network: "preprod", provider: emulator });
    const built = await builder.build(
      output({ address: baseAddress(2), value: { lovelace: 2_000_000n } }),
      { payer },
    );
    const refused = await emulator.submitTx(built.tx).catch((e: unknown) => e);
    expect(errorFact(refused)).toBe("rejected");
    expect(isRefusal(refused)).toBe(true);
    expect(isRefusal(notFound)).toBe(false);
  });

  it.each<[unknown, ReturnType<typeof errorFact>]>([
    // kind first
    [new ProviderError("x", { kind: "notFound" }), "notFound"],
    [new ProviderError("x", { kind: "rejected" }), "rejected"],
    [new ProviderError("x", { kind: "unsupported" }), "unsupported"],
    [{ kind: "notFound", status: 400 }, "notFound"],
    [{ kind: "rejected", status: 404 }, "rejected"],
    [{ kind: "invalidRequest", status: 400 }, undefined],
    [new ProviderError("x", { kind: "rateLimited", status: 429 }), undefined],
    // then status
    [{ status: 404 }, "notFound"],
    [{ status: 400 }, "rejected"],
    [Object.assign(new Error("x"), { status: 404 }), "notFound"],
    [{ status: "404" }, undefined],
    [{ status: 500 }, undefined],
    [{ status: 503 }, undefined],
    [{ code: 2 }, undefined],
    // the JSON text of a provider's HTTP answer, read by its status alone
    [JSON.stringify({ data: { error: "Not Found" }, status: 404 }), "notFound"],
    [JSON.stringify({ data: "bad tx", status: 400 }), "rejected"],
    [JSON.stringify({ data: "server error", status: 500 }), undefined],
    [JSON.stringify({ kind: "notFound" }), undefined],
    [JSON.stringify({ status: "404" }), undefined],
    [JSON.stringify({ data: {} }), undefined],
    [JSON.stringify([404]), undefined],
    ["null", undefined],
    [JSON.stringify(404), undefined],
    ["404 Not Found", undefined],
    ["status: 400", undefined],
    // the text of an error is never read
    [new Error(JSON.stringify({ status: 404 })), undefined],
    [new Error(JSON.stringify({ status: 400 })), undefined],
    [new Error("not found"), undefined],
    [null, undefined],
    [undefined, undefined],
    [404, undefined],
  ])("%p is %p", (thrown, fact) => {
    expect(errorFact(thrown)).toBe(fact);
  });

  it("takes only a 400 or the kind rejected as a refusal: a 500 is unknown", () => {
    for (const thrown of [
      { status: 500 },
      JSON.stringify({ status: 500 }),
      new Error(JSON.stringify({ status: 500 })),
      { status: 503 },
    ])
      expect(isRefusal(thrown)).toBe(false);
    expect(isRefusal({ status: 400 })).toBe(true);
    expect(isRefusal(JSON.stringify({ status: 400 }))).toBe(true);
    expect(isRefusal({ kind: "rejected" })).toBe(true);
  });

  it("is unknown when reading a field throws", () => {
    const hostile = Object.defineProperty({}, "kind", {
      get() {
        throw new Error("no");
      },
    });
    expect(errorFact(hostile)).toBeUndefined();
  });
});

describe("keepsAddressCache", () => {
  it("is false for a provider without the method, such as TxEmulator", async () => {
    expect(keepsAddressCache(await preprodEmulator())).toBe(false);
    const plain: Partial<IFetcher> & { utxos?: UTxO[] } = {};
    expect(keepsAddressCache(plain as IFetcher)).toBe(false);
  });
});
