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

import type { Validator } from "./plan-emulator-util";
import { output, TxBuilder } from "../../../src/tx-builder";
import {
  chainObserver,
  errorFact,
  isRefusal,
  keepsAddressCache,
  numericCodeOf,
  searchThenTip,
  submitFailure,
  submitFailureText,
} from "../../../src/tx-builder/plan/observer";
import { baseAddress } from "../../test-util";
import { VALIDATORS } from "./plan-emulator-util";
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

const preprodEmulator = (validator: Validator) =>
  TxEmulator.create({ validator, network: "preprod", slot: 1_000 });

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

  describe.each(VALIDATORS)("on TxEmulator (%s)", (v) => {
    it("finds a transaction with its block, height and validity, and reads the tip", async () => {
      const emulator = await preprodEmulator(v);
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
  it.each(VALIDATORS)(
    "reads the emulator's not found and refusal (%s)",
    async (v) => {
      const emulator = await preprodEmulator(v);
      const notFound = await emulator
        .fetchTxInfo(HASH)
        .catch((e: unknown) => e);
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
      const refused = await emulator
        .submitTx(built.tx)
        .catch((e: unknown) => e);
      expect(errorFact(refused)).toBe("rejected");
      expect(isRefusal(refused)).toBe(true);
      expect(isRefusal(notFound)).toBe(false);
    },
  );

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

/** The text an HTTP provider throws for an answer with a status: its body, headers and status */
const httpAnswer = (status: number, data: unknown = {}) =>
  JSON.stringify({
    data,
    headers: { "content-type": "application/json" },
    status,
  });

/** A getter that throws for one field */
const throwingField = (name: string) =>
  Object.defineProperty({}, name, {
    get() {
      throw new Error("no");
    },
  });

/** A value that refers to itself as its cause */
const ownCause = () => {
  const value: { cause?: unknown } = {};
  value.cause = value;
  return value;
};

describe("what a failed submission says", () => {
  type Answer = ReturnType<typeof submitFailure>;
  it.each<[string, unknown, Answer]>([
    // a ProviderError: its kind decides, and its status is given
    [
      "ProviderError unavailable",
      new ProviderError("x", { kind: "unavailable" }),
      { reason: "unavailable" },
    ],
    [
      "ProviderError unavailable 503",
      new ProviderError("x", { kind: "unavailable", status: 503 }),
      { reason: "unavailable", status: 503 },
    ],
    [
      "ProviderError rateLimited",
      new ProviderError("x", { kind: "rateLimited" }),
      { reason: "rateLimited" },
    ],
    [
      "ProviderError rateLimited 429",
      new ProviderError("x", { kind: "rateLimited", status: 429 }),
      { reason: "rateLimited", status: 429 },
    ],
    [
      "ProviderError unauthorized",
      new ProviderError("x", { kind: "unauthorized" }),
      { reason: "unauthorized" },
    ],
    [
      "ProviderError unauthorized 403",
      new ProviderError("x", { kind: "unauthorized", status: 403 }),
      { reason: "unauthorized", status: 403 },
    ],
    [
      "ProviderError notFound 404",
      new ProviderError("x", { kind: "notFound", status: 404 }),
      { reason: "unknown", status: 404 },
    ],
    // a refusal of the ledger, as errorFact reads it, decides first
    [
      "ProviderError rejected 400",
      new ProviderError("x", { kind: "rejected", status: 400 }),
      { reason: "refused", status: 400 },
    ],
    ["plain kind rejected", { kind: "rejected" }, { reason: "refused" }],
    [
      "kind rejected with 503",
      { kind: "rejected", status: 503 },
      { reason: "refused", status: 503 },
    ],
    [
      "status 400 with a refused connection's code",
      { status: 400, code: "ECONNREFUSED" },
      { reason: "refused", status: 400 },
    ],
    [
      "a kind of its own beside status 400 is no refusal",
      { kind: "unavailable", status: 400 },
      { reason: "unavailable", status: 400 },
    ],
    [
      "a getter of kind that throws beside status 400",
      Object.defineProperty({ status: 400 }, "kind", {
        get() {
          throw new Error("no");
        },
      }),
      { reason: "unknown", status: 400 },
    ],
    [
      "ProviderError invalidRequest",
      new ProviderError("x", { kind: "invalidRequest" }),
      { reason: "unknown" },
    ],
    [
      "ProviderError unsupported",
      new ProviderError("x", { kind: "unsupported" }),
      { reason: "unknown" },
    ],
    // a kind is never overridden by a status
    [
      "kind unknown to the reader, with 503",
      { kind: "other", status: 503 },
      { reason: "unknown", status: 503 },
    ],
    [
      "kind unauthorized with 500",
      { kind: "unauthorized", status: 500 },
      { reason: "unauthorized", status: 500 },
    ],
    [
      "kind unavailable with 429",
      { kind: "unavailable", status: 429 },
      { reason: "unavailable", status: 429 },
    ],
    [
      "kind unauthorized with a refused connection's code",
      { kind: "unauthorized", code: "ECONNREFUSED" },
      { reason: "unauthorized" },
    ],
    [
      "plain kind rateLimited",
      { kind: "rateLimited" },
      { reason: "rateLimited" },
    ],
    [
      "kind given as a number",
      { kind: 1, status: 429 },
      { reason: "rateLimited", status: 429 },
    ],
    // a numeric status
    ["status 429", { status: 429 }, { reason: "rateLimited", status: 429 }],
    ["status 401", { status: 401 }, { reason: "unauthorized", status: 401 }],
    ["status 403", { status: 403 }, { reason: "unauthorized", status: 403 }],
    ["status 408", { status: 408 }, { reason: "unavailable", status: 408 }],
    ["status 425", { status: 425 }, { reason: "unavailable", status: 425 }],
    ["status 500", { status: 500 }, { reason: "unavailable", status: 500 }],
    ["status 502", { status: 502 }, { reason: "unavailable", status: 502 }],
    ["status 599", { status: 599 }, { reason: "unavailable", status: 599 }],
    ["status 400", { status: 400 }, { reason: "refused", status: 400 }],
    ["status 404", { status: 404 }, { reason: "unknown", status: 404 }],
    ["status 418", { status: 418 }, { reason: "unknown", status: 418 }],
    ["status 302", { status: 302 }, { reason: "unknown", status: 302 }],
    ["status 100", { status: 100 }, { reason: "unknown", status: 100 }],
    [
      "an Error with status 503",
      Object.assign(new Error("x"), { status: 503 }),
      { reason: "unavailable", status: 503 },
    ],
    [
      "a status decides before a code",
      { status: 404, code: "ECONNRESET" },
      { reason: "unknown", status: 404 },
    ],
    // the text the published HTTP providers throw for an answer with a status
    [
      "HTTP answer 400",
      httpAnswer(400, {
        status_code: 400,
        error: "Bad Request",
        message: "...",
      }),
      { reason: "refused", status: 400 },
    ],
    [
      "HTTP answer 403",
      httpAnswer(403, {
        status_code: 403,
        error: "Forbidden",
        message: "Invalid project token.",
      }),
      { reason: "unauthorized", status: 403 },
    ],
    [
      "HTTP answer 425",
      httpAnswer(425, { status_code: 425, error: "Mempool Full" }),
      { reason: "unavailable", status: 425 },
    ],
    [
      "HTTP answer 429",
      httpAnswer(429, { status_code: 429, error: "Project Over Limit" }),
      { reason: "rateLimited", status: 429 },
    ],
    [
      "HTTP answer 500",
      httpAnswer(500, "internal error"),
      { reason: "unavailable", status: 500 },
    ],
    [
      "HTTP answer 503",
      httpAnswer(503, "<html>Service Unavailable</html>"),
      { reason: "unavailable", status: 503 },
    ],
    // the text the published HTTP providers throw for a request that got no response
    [
      "no response, connection refused",
      JSON.stringify({
        code: "ECONNREFUSED",
        message: "connect ECONNREFUSED 127.0.0.1:8080",
      }),
      { reason: "unavailable" },
    ],
    [
      "no response, network error",
      JSON.stringify({ code: "ERR_NETWORK", message: "Network Error" }),
      { reason: "unavailable" },
    ],
    [
      "no response, timed out",
      JSON.stringify({
        code: "ECONNABORTED",
        message: "timeout of 1000ms exceeded",
      }),
      { reason: "unavailable" },
    ],
    [
      "no response, canceled",
      JSON.stringify({ code: "ERR_CANCELED", message: "canceled" }),
      { reason: "unknown" },
    ],
    [
      "a JSON text is not read by its kind",
      JSON.stringify({ kind: "unavailable" }),
      { reason: "unknown" },
    ],
    [
      "a JSON text that is quoted twice",
      JSON.stringify(httpAnswer(503)),
      { reason: "unknown" },
    ],
    // the failure of the transport
    [
      "fetch failed, connection refused",
      new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }),
      { reason: "unavailable" },
    ],
    [
      "fetch failed, socket closed",
      new TypeError("fetch failed", { cause: { code: "UND_ERR_SOCKET" } }),
      { reason: "unavailable" },
    ],
    [
      "fetch failed, connect timeout",
      new TypeError("fetch failed", {
        cause: { code: "UND_ERR_CONNECT_TIMEOUT" },
      }),
      { reason: "unavailable" },
    ],
    [
      "fetch failed, name not found",
      new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }),
      { reason: "unavailable" },
    ],
    [
      "fetch failed, bad port",
      new TypeError("fetch failed", { cause: new Error("bad port") }),
      { reason: "unknown" },
    ],
    [
      "an error with a code of its own",
      Object.assign(new Error("x"), { code: "ECONNRESET" }),
      { reason: "unavailable" },
    ],
    [
      "an AggregateError of a refused connection",
      Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }),
      { reason: "unavailable" },
    ],
    [
      "DOMException TimeoutError",
      new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      ),
      { reason: "unavailable" },
    ],
    [
      "DOMException AbortError",
      new DOMException("The operation was aborted.", "AbortError"),
      { reason: "unknown" },
    ],
    [
      "a code that is not of a transport",
      { code: "ERR_BAD_REQUEST" },
      { reason: "unknown" },
    ],
    ["a code in lower case", { code: "econnrefused" }, { reason: "unknown" }],
    // the error of a provider that rejects with its JSON-RPC error, and a wallet's error
    [
      "a JSON-RPC error",
      { code: 3005, message: "...", data: {} },
      { reason: "unknown" },
    ],
    [
      "a CIP-30 TxSendError",
      { code: 2, info: "failure" },
      { reason: "unknown" },
    ],
    [
      "the error of a provider that cannot run its own error handling",
      new ReferenceError("XMLHttpRequest is not defined"),
      { reason: "unknown" },
    ],
    // the text of an error is never read
    [
      "a message that names a status",
      new Error(JSON.stringify({ status: 503 })),
      { reason: "unknown" },
    ],
    [
      "a message that names a code",
      new Error("connect ECONNREFUSED 127.0.0.1:80"),
      { reason: "unknown" },
    ],
    [
      "text that names a status",
      "503 Service Unavailable",
      { reason: "unknown" },
    ],
    // values that tell nothing, and hostile ones
    ["null", null, { reason: "unknown" }],
    ["undefined", undefined, { reason: "unknown" }],
    ["a number", 503, { reason: "unknown" }],
    ["NaN", Number.NaN, { reason: "unknown" }],
    ["a JSON array", JSON.stringify([{ status: 503 }]), { reason: "unknown" }],
    ["JSON null", "null", { reason: "unknown" }],
    ["a JSON number", "503", { reason: "unknown" }],
    ["a status given as text", { status: "503" }, { reason: "unknown" }],
    [
      "a status given as text in JSON",
      JSON.stringify({ status: "429" }),
      { reason: "unknown" },
    ],
    ["a status above 599", { status: 600 }, { reason: "unknown" }],
    ["a status below 100", { status: 99 }, { reason: "unknown" }],
    ["a status that is not whole", { status: 500.5 }, { reason: "unknown" }],
    ["a status that is infinite", { status: Infinity }, { reason: "unknown" }],
    [
      "a kind out of range, with a status out of range",
      { kind: "unavailable", status: 1000 },
      { reason: "unavailable" },
    ],
    [
      "a getter of kind that throws",
      throwingField("kind"),
      { reason: "unknown" },
    ],
    [
      "a getter of status that throws",
      throwingField("status"),
      { reason: "unknown" },
    ],
    [
      "a getter of cause that throws",
      throwingField("cause"),
      { reason: "unknown" },
    ],
    [
      "a getter that throws beside a status",
      Object.defineProperty({ status: 429 }, "kind", {
        get() {
          throw new Error("no");
        },
      }),
      { reason: "rateLimited", status: 429 },
    ],
    [
      "a Proxy that throws",
      new Proxy(
        {},
        {
          get() {
            throw new Error("no");
          },
        },
      ),
      { reason: "unknown" },
    ],
    [
      "a cause that is a Proxy that throws",
      {
        cause: new Proxy(
          {},
          {
            get() {
              throw new Error("no");
            },
          },
        ),
      },
      { reason: "unknown" },
    ],
    ["a cause that is the value itself", ownCause(), { reason: "unknown" }],
    [
      "a cause that is the value itself, with a code",
      Object.assign(ownCause(), { code: "ETIMEDOUT" }),
      { reason: "unavailable" },
    ],
    [
      "a code two causes down",
      { cause: { cause: { code: "ECONNREFUSED" } } },
      { reason: "unknown" },
    ],
  ])("%s", (_, thrown, answer) => {
    expect(submitFailure(thrown)).toEqual(answer);
  });

  it.each(VALIDATORS)(
    "reads the emulator's refusal as refused, with the status it carries (%s)",
    async (v) => {
      const emulator = await preprodEmulator(v);
      const payer = {
        changeAddress: ADDRESS,
        utxos: [emulator.fund(ADDRESS, { lovelace: 10_000_000n })],
      };
      const builder = new TxBuilder({ network: "preprod", provider: emulator });
      const built = await builder.build(
        output({ address: baseAddress(2), value: { lovelace: 2_000_000n } }),
        { payer },
      );
      const refused = await emulator
        .submitTx(built.tx)
        .catch((e: unknown) => e);
      expect(submitFailure(refused)).toEqual({
        reason: "refused",
        status: 400,
      });
    },
  );
});

describe("what a failed submission says: statuses, transport codes and gRPC", () => {
  it.each<[number, string]>([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [408, "unavailable"],
    [425, "unavailable"],
    [429, "rateLimited"],
    [499, "unknown"],
    [500, "unavailable"],
    [501, "unavailable"],
    [503, "unavailable"],
    [504, "unavailable"],
    [599, "unavailable"],
    [402, "unknown"],
    [418, "unknown"],
  ])("status %i is %s, with its status", (status, reason) => {
    expect(submitFailure({ status })).toEqual({ reason, status });
    expect(submitFailure(httpAnswer(status))).toEqual({ reason, status });
  });

  // Each code of a connection that failed, was reset or timed out, on the value and on its cause
  const transportCodes = [
    "ECONNREFUSED",
    "ECONNRESET",
    "ECONNABORTED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EAI_FAIL",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "EHOSTDOWN",
    "ENETUNREACH",
    "ENETDOWN",
    "EPIPE",
    "ERR_NETWORK",
    "ERR_SOCKET_CONNECTION_TIMEOUT",
    "ERR_TLS_HANDSHAKE_TIMEOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "UND_ERR_SOCKET",
  ];
  it.each(transportCodes)("code %s is unavailable", (code) => {
    expect(submitFailure(Object.assign(new Error("x"), { code }))).toEqual({
      reason: "unavailable",
    });
    expect(
      submitFailure(new TypeError("fetch failed", { cause: { code } })),
    ).toEqual({ reason: "unavailable" });
    expect(submitFailure(JSON.stringify({ code, message: "x" }))).toEqual({
      reason: "unavailable",
    });
  });

  it.each([
    "ERR_SSL_WRONG_VERSION_NUMBER",
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "ERR_CANCELED",
    "ABORT_ERR",
    "UND_ERR_ABORTED",
  ])("code %s is unknown", (code) => {
    expect(submitFailure({ code })).toEqual({ reason: "unknown" });
    expect(submitFailure({ cause: { code } })).toEqual({ reason: "unknown" });
  });

  it("reads the name TimeoutError on the value and on its cause", () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    expect(submitFailure(timeout)).toEqual({ reason: "unavailable" });
    expect(
      submitFailure(new Error("submit failed", { cause: timeout })),
    ).toEqual({ reason: "unavailable" });
    expect(
      submitFailure(
        new Error("submit failed", {
          cause: new DOMException("aborted", "AbortError"),
        }),
      ),
    ).toEqual({ reason: "unknown" });
  });

  /** A value shaped like a ConnectError of the connect packages */
  const connectLike = (code: unknown, cause?: unknown) =>
    Object.assign(new Error("x"), { name: "ConnectError", code, cause });

  it.each<[number, string]>([
    [16, "unauthorized"],
    [7, "unauthorized"],
    [8, "rateLimited"],
    [14, "unavailable"],
    [4, "unavailable"],
    [1, "unknown"],
    [2, "unknown"],
    [3, "unknown"],
    [5, "unknown"],
    [13, "unknown"],
    [15, "unknown"],
  ])(
    "a ConnectError with gRPC code %i is %s, with no status",
    (code, reason) => {
      expect(submitFailure(connectLike(code))).toEqual({ reason });
    },
  );

  it.each<[string, unknown, ReturnType<typeof submitFailure>]>([
    [
      "a gRPC code under another name",
      Object.assign(new Error("x"), { code: 16 }),
      { reason: "unknown" },
    ],
    [
      "a CIP-30 code under another name",
      { name: "TxSendError", code: 8 },
      { reason: "unknown" },
    ],
    ["a gRPC code that is not whole", connectLike(16.5), { reason: "unknown" }],
    ["a gRPC code given as text", connectLike("16"), { reason: "unknown" }],
    [
      "a gRPC code before a transport code of its cause",
      connectLike(16, { code: "ECONNREFUSED" }),
      { reason: "unauthorized" },
    ],
    [
      "a transport code of the cause of a gRPC code it does not map",
      connectLike(2, { code: "ECONNREFUSED" }),
      { reason: "unavailable" },
    ],
    [
      "a gRPC Unavailable with a refused connection as its cause",
      connectLike(14, { code: "ECONNREFUSED" }),
      { reason: "unavailable" },
    ],
    [
      "a status before a gRPC code",
      Object.assign(connectLike(16), { status: 503 }),
      { reason: "unavailable", status: 503 },
    ],
    [
      "a kind before a gRPC code",
      Object.assign(connectLike(16), { kind: "rateLimited" }),
      { reason: "rateLimited" },
    ],
  ])("%s", (_, thrown, answer) => {
    expect(submitFailure(thrown)).toEqual(answer);
  });
});

describe("the words of a failed submission", () => {
  it.each<[ReturnType<typeof submitFailure>, string]>([
    [
      { reason: "unavailable" },
      "the submitter's error is a failed, reset or timed-out connection or request, or a server that did not take the request",
    ],
    [
      { reason: "unavailable", status: 503 },
      "the submitter's error is a failed, reset or timed-out connection or request, or a server that did not take the request (HTTP 503)",
    ],
    [
      { reason: "rateLimited" },
      "the submitter's error is a rate limit or an exhausted quota",
    ],
    [
      { reason: "rateLimited", status: 429 },
      "the submitter's error is a rate limit or an exhausted quota (HTTP 429)",
    ],
    [
      { reason: "unauthorized" },
      "the submitter's error is an authorization failure, such as a wrong API key",
    ],
    [
      { reason: "unauthorized", status: 401 },
      "the submitter's error is an authorization failure, such as a wrong API key (HTTP 401)",
    ],
    [
      { reason: "refused" },
      "the submitter's error is a refusal of the ledger, which proves nothing here",
    ],
    [
      { reason: "refused", status: 400 },
      "the submitter's error is a refusal of the ledger, which proves nothing here (HTTP 400)",
    ],
    [
      { reason: "unknown" },
      "the submitter's error does not give a reason this library reads",
    ],
    [
      { reason: "unknown", status: 418 },
      "the submitter's error does not give a reason this library reads (HTTP 418)",
    ],
  ])("%j", (failure, text) => {
    expect(submitFailureText(failure)).toBe(text);
  });
});

describe("numericCodeOf", () => {
  it.each<[string, unknown, number | undefined]>([
    ["a CIP-30 error", { code: 2, info: "failure" }, 2],
    ["a JSON-RPC error", { code: 3005, message: "x" }, 3005],
    ["a code given as text", { code: "ECONNREFUSED" }, undefined],
    ["a code given as text that is a number", { code: "2" }, undefined],
    ["null", null, undefined],
    ["a number", 2, undefined],
    ["a getter of code that throws", throwingField("code"), undefined],
    [
      "a Proxy that throws",
      new Proxy(
        {},
        {
          get() {
            throw new Error("no");
          },
        },
      ),
      undefined,
    ],
    [
      "a revoked Proxy",
      (() => {
        const { proxy, revoke } = Proxy.revocable({ code: 2 }, {});
        revoke();
        return proxy;
      })(),
      undefined,
    ],
  ])("%s", (_, value, code) => {
    expect(numericCodeOf(value)).toBe(code);
  });
});

describe("keepsAddressCache", () => {
  it.each(VALIDATORS)(
    "is false for a provider without the method, such as TxEmulator (%s)",
    async (v) => {
      expect(keepsAddressCache(await preprodEmulator(v))).toBe(false);
      const plain: Partial<IFetcher> & { utxos?: UTxO[] } = {};
      expect(keepsAddressCache(plain as IFetcher)).toBe(false);
    },
  );
});
