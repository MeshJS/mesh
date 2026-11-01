import {
  CachedFetcher,
  IFetcher,
  resolveEpochEnd,
  UTxO,
} from "@meshsdk/common";

const utxo = (txHash: string, outputIndex: number): UTxO => ({
  input: { txHash, outputIndex },
  output: {
    address: "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
    amount: [{ unit: "lovelace", quantity: "1000000" }],
  },
});

const mockFetcher = () =>
  ({
    fetchUTxOs: jest.fn(async (hash: string) => [utxo(hash, 0), utxo(hash, 1)]),
    fetchCostModels: jest.fn(async () => [[1], [2], [3]]),
    fetchProtocolParameters: jest.fn(async (epoch: number) => ({ epoch })),
    fetchAddressUTxOs: jest.fn(async () => []),
  }) as unknown as IFetcher & Record<string, jest.Mock>;

// 2026-10-12, mid mainnet epoch 661 and mid preview/preprod day
const NOW = 1791816751000;

describe("CachedFetcher", () => {
  describe("fetchUTxOs", () => {
    it("fetches a transaction's outputs once, whatever index is asked for", async () => {
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher);

      const [all, first, second] = await Promise.all([
        cached.fetchUTxOs("a"),
        cached.fetchUTxOs("a", 0),
        cached.fetchUTxOs("a", 1),
      ]);

      expect(all).toHaveLength(2);
      expect(first).toEqual([utxo("a", 0)]);
      expect(second).toEqual([utxo("a", 1)]);
      expect(fetcher.fetchUTxOs).toHaveBeenCalledTimes(1);
      expect(fetcher.fetchUTxOs).toHaveBeenCalledWith("a");
    });

    it("does not remember failed or empty responses", async () => {
      const fetcher = mockFetcher();
      fetcher.fetchUTxOs!.mockRejectedValueOnce(new Error("down"));
      fetcher.fetchUTxOs!.mockResolvedValueOnce([]);
      const cached = new CachedFetcher(fetcher);

      await expect(cached.fetchUTxOs("a")).rejects.toThrow("down");
      expect(await cached.fetchUTxOs("a")).toEqual([]);
      expect(await cached.fetchUTxOs("a")).toHaveLength(2);
      expect(await cached.fetchUTxOs("a")).toHaveLength(2);
      expect(fetcher.fetchUTxOs).toHaveBeenCalledTimes(3);
    });

    it("asks again when a cached transaction lacks the requested output", async () => {
      const fetcher = mockFetcher();
      fetcher.fetchUTxOs!.mockResolvedValueOnce([utxo("a", 0)]);
      const cached = new CachedFetcher(fetcher);

      await cached.fetchUTxOs("a");
      expect(await cached.fetchUTxOs("a", 1)).toEqual([utxo("a", 1)]);
      expect(await cached.fetchUTxOs("a", 5)).toEqual([]);
      expect(fetcher.fetchUTxOs).toHaveBeenCalledTimes(3);
    });

    it("drops the least recently used transaction beyond its capacity", async () => {
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher, { maxCachedTxs: 2 });

      await cached.fetchUTxOs("a");
      await cached.fetchUTxOs("b");
      await cached.fetchUTxOs("a");
      await cached.fetchUTxOs("c");
      await cached.fetchUTxOs("a");
      await cached.fetchUTxOs("b");

      expect(fetcher.fetchUTxOs.mock.calls.map(([hash]) => hash)).toEqual([
        "a",
        "b",
        "c",
        "b",
      ]);
    });
  });

  describe("epoch values", () => {
    it("keeps the latest cost models and parameters until the epoch ends", async () => {
      let now = NOW;
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher, {
        network: "mainnet",
        now: () => now,
      });

      await cached.fetchCostModels();
      await cached.fetchProtocolParameters(undefined as unknown as number);
      now = resolveEpochEnd("mainnet", NOW) - 1;
      await cached.fetchCostModels();
      await cached.fetchProtocolParameters(undefined as unknown as number);
      expect(fetcher.fetchCostModels).toHaveBeenCalledTimes(1);
      expect(fetcher.fetchProtocolParameters).toHaveBeenCalledTimes(1);

      now = resolveEpochEnd("mainnet", NOW);
      await cached.fetchCostModels();
      await cached.fetchProtocolParameters(undefined as unknown as number);
      expect(fetcher.fetchCostModels).toHaveBeenCalledTimes(2);
      expect(fetcher.fetchProtocolParameters).toHaveBeenCalledTimes(2);
    });

    it("uses the earliest public epoch end when the network is unknown", async () => {
      let now = NOW;
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher, { now: () => now });

      await cached.fetchCostModels();
      // A preview epoch is a day long and ends before the mainnet one
      now = resolveEpochEnd("preview", NOW);
      await cached.fetchCostModels();
      expect(fetcher.fetchCostModels).toHaveBeenCalledTimes(2);
    });

    it("keeps values fetched right after a boundary only briefly", async () => {
      const boundary = resolveEpochEnd("mainnet", NOW);
      let now = boundary + 60 * 1000;
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher, {
        network: "mainnet",
        now: () => now,
      });

      await cached.fetchCostModels();
      now = boundary + 5 * 60 * 1000;
      await cached.fetchCostModels();
      now = resolveEpochEnd("mainnet", now) - 1;
      await cached.fetchCostModels();
      expect(fetcher.fetchCostModels).toHaveBeenCalledTimes(2);
    });

    it("keeps parameters of a given epoch for good", async () => {
      let now = NOW;
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher, {
        network: "mainnet",
        now: () => now,
      });

      await cached.fetchProtocolParameters(600);
      now = resolveEpochEnd("mainnet", NOW) + 10 * 432000 * 1000;
      expect(await cached.fetchProtocolParameters(600)).toEqual({ epoch: 600 });
      expect(fetcher.fetchProtocolParameters).toHaveBeenCalledTimes(1);
    });

    it("does not cache epoch values for a custom network", async () => {
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher, { network: "testnet" });

      await cached.fetchCostModels();
      await cached.fetchCostModels();
      expect(fetcher.fetchCostModels).toHaveBeenCalledTimes(2);
    });

    it("does not remember a failed fetch", async () => {
      const fetcher = mockFetcher();
      fetcher.fetchCostModels!.mockRejectedValueOnce(new Error("down"));
      const cached = new CachedFetcher(fetcher, { now: () => NOW });

      await expect(cached.fetchCostModels()).rejects.toThrow("down");
      expect(await cached.fetchCostModels()).toEqual([[1], [2], [3]]);
      expect(fetcher.fetchCostModels).toHaveBeenCalledTimes(2);
    });
  });

  describe("chain state", () => {
    it("keeps answers for 10 seconds by default", async () => {
      let now = NOW;
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher, { now: () => now });

      await Promise.all([
        cached.fetchAddressUTxOs("addr"),
        cached.fetchAddressUTxOs("addr"),
      ]);
      now += 9999;
      await cached.fetchAddressUTxOs("addr");
      expect(fetcher.fetchAddressUTxOs).toHaveBeenCalledTimes(1);

      now += 1;
      await cached.fetchAddressUTxOs("addr");
      expect(fetcher.fetchAddressUTxOs).toHaveBeenCalledTimes(2);
    });

    it("keys answers by every argument", async () => {
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher, { now: () => NOW });

      await cached.fetchAddressUTxOs("addr");
      await cached.fetchAddressUTxOs("addr", "asset");
      await cached.fetchAddressUTxOs("other");
      expect(fetcher.fetchAddressUTxOs).toHaveBeenCalledTimes(3);
    });

    it("forgets answers on clearVolatile but keeps immutable ones", async () => {
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher, { now: () => NOW });

      await cached.fetchAddressUTxOs("addr");
      await cached.fetchUTxOs("a");
      cached.clearVolatile();
      await cached.fetchAddressUTxOs("addr");
      await cached.fetchUTxOs("a");
      expect(fetcher.fetchAddressUTxOs).toHaveBeenCalledTimes(2);
      expect(fetcher.fetchUTxOs).toHaveBeenCalledTimes(1);
    });

    it("does not remember a failed fetch", async () => {
      const fetcher = mockFetcher();
      fetcher.fetchAddressUTxOs!.mockRejectedValueOnce(new Error("down"));
      const cached = new CachedFetcher(fetcher, { now: () => NOW });

      await expect(cached.fetchAddressUTxOs("addr")).rejects.toThrow("down");
      await cached.fetchAddressUTxOs("addr");
      await cached.fetchAddressUTxOs("addr");
      expect(fetcher.fetchAddressUTxOs).toHaveBeenCalledTimes(2);
    });

    it("can be disabled", async () => {
      const fetcher = mockFetcher();
      const cached = new CachedFetcher(fetcher, { volatileTtlMs: 0 });

      await cached.fetchAddressUTxOs("addr");
      await cached.fetchAddressUTxOs("addr");
      expect(fetcher.fetchAddressUTxOs).toHaveBeenCalledTimes(2);
    });
  });

  it("shares one cache per fetcher", () => {
    const fetcher = mockFetcher();
    const cached = CachedFetcher.wrap(fetcher);

    expect(CachedFetcher.wrap(fetcher)).toBe(cached);
    expect(CachedFetcher.wrap(cached)).toBe(cached);
    expect(CachedFetcher.wrap(mockFetcher())).not.toBe(cached);
  });
});
