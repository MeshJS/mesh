import {
  customNetwork,
  networkConfig,
  NetworkConfig,
  NetworkInput,
  SLOT_CONFIG_NETWORK,
  slotAt,
  timeAt,
} from "@meshsdk/common";
import {
  BlockfrostProvider,
  resolveEpochEnd,
  resolveEpochNo,
  resolveSlotNo,
  slotAt as slotAtFromCore,
  // SLOT_CONFIG_NETWORK,
  // unixTimeToEnclosingSlot,
} from "@meshsdk/core";

describe("Time", () => {
  describe("resolveSlotNo", () => {
    it("should resolve correct mainnet slot number", () => {
      // Aug 07 2024 11:56:59 GMT+0800
      const res = resolveSlotNo("mainnet", 1723003026421);
      expect(res).toBe("131436735");
    });
    it("should resolve correct preprod slot number", () => {
      // Aug 07 2024 11:56:59 GMT+0800
      const res = resolveSlotNo("preprod", 1723003026421);
      expect(res).toBe("67319826");
    });
    it("should resolve correct preview slot number", () => {
      // Aug 07 2024 11:56:59 GMT+0800
      const res = resolveSlotNo("preview", 1723003026421);
      expect(res).toBe("56347026");
    });
  });
  describe("resolveEpochNo", () => {
    describe("mainnet", () => {
      it("should resolve correct mainnet epoch number", () => {
        // Aug 07 2024 11:42:47 GMT+0800
        const res = resolveEpochNo("mainnet", 1723000771631);
        expect(res).toBe(501);
      });
      it("should resolve correct mainnet epoch number", () => {
        // May 27, 2024 05:44:51 GMT+0800
        const res = resolveEpochNo("mainnet", 1716759891000);
        expect(res).toBe(487);
      });
      it("should resolve correct epoch number at lower bound", () => {
        // Aug 3, 2024 05:44:51 AM GMT+0800
        const res = resolveEpochNo("mainnet", 1722663891000);
        expect(res).toBe(501);
      });
      it("should resolve correct epoch number at upper bound", () => {
        // Aug 8, 2024 05:44:51 AM GMT+0800
        const res = resolveEpochNo("mainnet", 1723067091000 - 1);
        expect(res).toBe(501);
      });
    });
    describe("preprod", () => {
      it("should resolve correct preprod epoch number", () => {
        // Aug 07 2024 11:42:47 GMT+0800
        const res = resolveEpochNo("preprod", 1723000771631);
        expect(res).toBe(159);
      });
      it("should resolve correct preprod epoch number", () => {
        // Jun 22, 2024 08:00:00 GMT+0800
        const res = resolveEpochNo("preprod", 1719014400000);
        expect(res).toBe(150);
      });
      it("should resolve correct epoch number at lower bound", () => {
        // Aug 4, 2024 08:00:00 GMT+0800
        const res = resolveEpochNo("preprod", 1722729600000);
        expect(res).toBe(159);
      });
      it("should resolve correct epoch number at upper bound", () => {
        // Aug 9, 2024 08:00:00 GMT+0800
        const res = resolveEpochNo("preprod", 1723161600000 - 1);
        expect(res).toBe(159);
      });
    });
    describe("preview", () => {
      it("should resolve correct preview epoch number", () => {
        // Aug 07 2024 11:42:47 GMT+0800
        const res = resolveEpochNo("preview", 1723000771631);
        expect(res).toBe(652);
      });
      it("should resolve correct preview epoch number", () => {
        // Jul 26, 2024 18:00:00 GMT+0800
        const res = resolveEpochNo("preview", 1721988000000);
        expect(res).toBe(640);
      });
      it("should resolve correct epoch number at lower bound", () => {
        // Aug 7, 2024 08:00:00 GMT+0800
        const res = resolveEpochNo("preview", 1722988800000);
        expect(res).toBe(652);
      });
      it("should resolve correct epoch number at upper bound", () => {
        // Aug 8, 2024 08:00:00 GMT+0800
        const res = resolveEpochNo("preview", 1723075200000 - 1);
        expect(res).toBe(652);
      });
    });
  });

  describe("time tests using blockfrost", () => {
    if (process.env.BLOCKFROST_API_KEY_PREPROD) {
      it("test preprod", async () => {
        if (!process.env.BLOCKFROST_API_KEY_PREPROD) {
          console.error("could not find blockfrost preprod api key in env");
          process.exit(1);
        }
        const preprodBlockfrost = new BlockfrostProvider(
          process.env.BLOCKFROST_API_KEY_PREPROD!,
        );

        const latestBlockInfo = await preprodBlockfrost.fetchLatestBlock();
        const calculatedSlot = Number(resolveSlotNo("preprod"));

        const calculatedEpoch = Number(resolveEpochNo("preprod"));

        // Allow calculated slot to be within 100 seconds of latest block
        expect(calculatedSlot).toBeGreaterThan(
          Number(latestBlockInfo.slot) - 100,
        );
        expect(calculatedSlot).toBeLessThan(Number(latestBlockInfo.slot) + 100);
        expect(calculatedEpoch).toBe(Number(latestBlockInfo.epoch));
      });
    }

    if (process.env.BLOCKFROST_API_KEY_MAINNET) {
      it("test mainnet", async () => {
        if (!process.env.BLOCKFROST_API_KEY_MAINNET) {
          console.error("could not find blockfrost mainnet api key in env");
          process.exit(1);
        }
        const mainnetBlockfrost = new BlockfrostProvider(
          process.env.BLOCKFROST_API_KEY_MAINNET!,
        );

        const latestBlockInfo = await mainnetBlockfrost.fetchLatestBlock();
        const calculatedSlot = Number(resolveSlotNo("mainnet"));

        const calculatedEpoch = Number(resolveEpochNo("mainnet"));

        // Allow calculated slot to be within 100 seconds of latest block
        expect(calculatedSlot).toBeGreaterThan(
          Number(latestBlockInfo.slot) - 100,
        );
        expect(calculatedSlot).toBeLessThan(Number(latestBlockInfo.slot) + 100);
        expect(calculatedEpoch).toBe(Number(latestBlockInfo.epoch));
      });
    }

    if (process.env.BLOCKFROST_API_KEY_PREVIEW) {
      it("test preview", async () => {
        if (!process.env.BLOCKFROST_API_KEY_PREVIEW) {
          console.error("could not find blockfrost preview api key in env");
          process.exit(1);
        }
        const previewBlockfrost = new BlockfrostProvider(
          process.env.BLOCKFROST_API_KEY_PREVIEW!,
        );

        const latestBlockInfo = await previewBlockfrost.fetchLatestBlock();
        const calculatedSlot = Number(resolveSlotNo("preview"));

        const calculatedEpoch = Number(resolveEpochNo("preview"));

        // Allow calculated slot to be within 100 seconds of latest block
        expect(calculatedSlot).toBeGreaterThan(
          Number(latestBlockInfo.slot) - 100,
        );
        expect(calculatedSlot).toBeLessThan(Number(latestBlockInfo.slot) + 100);
        expect(calculatedEpoch).toBe(Number(latestBlockInfo.epoch));
      });
    }
  });
  describe("resolveEpochEnd", () => {
    // Chain tips read on 2026-10-12: block time, epoch and slot within the epoch
    it("should resolve the end of the current mainnet epoch", () => {
      // epoch 661, epoch slot 61660 of 432000
      expect(resolveEpochEnd("mainnet", 1791816751000)).toBe(
        (1791816751 - 61660 + 432000) * 1000,
      );
    });
    it("should resolve the end of the current preprod epoch", () => {
      // epoch 318, epoch slot 399111 of 432000
      expect(resolveEpochEnd("preprod", 1791816711000)).toBe(
        (1791816711 - 399111 + 432000) * 1000,
      );
    });
    it("should resolve the end of the current preview epoch", () => {
      // epoch 1448, epoch slot 53543 of 86400
      expect(resolveEpochEnd("preview", 1791816743000)).toBe(
        (1791816743 - 53543 + 86400) * 1000,
      );
    });
    it("should resolve the next epoch at an exact boundary", () => {
      const boundary = resolveEpochEnd("preview", 1791816743000);
      expect(resolveEpochEnd("preview", boundary)).toBe(
        boundary + 86400 * 1000,
      );
      expect(resolveEpochNo("preview", boundary)).toBe(1449);
    });
    it("should reject a network without known epochs", () => {
      expect(() => resolveEpochEnd("testnet")).toThrow();
    });
  });

  describe("networkConfig", () => {
    it("gives the name, id, slot clock and magic of each public network", () => {
      expect(networkConfig("mainnet")).toEqual({
        name: "mainnet",
        networkId: 1,
        slotConfig: SLOT_CONFIG_NETWORK.mainnet,
        magic: 764824073,
      });
      expect(networkConfig("preprod")).toEqual({
        name: "preprod",
        networkId: 0,
        slotConfig: SLOT_CONFIG_NETWORK.preprod,
        magic: 1,
      });
      expect(networkConfig("preview")).toEqual({
        name: "preview",
        networkId: 0,
        slotConfig: SLOT_CONFIG_NETWORK.preview,
        magic: 2,
      });
    });
    it("gives a copy of the shared slot clock", () => {
      for (const name of ["mainnet", "preprod", "preview"] as const) {
        const config = networkConfig(name);
        expect(config.slotConfig).not.toBe(SLOT_CONFIG_NETWORK[name]);
        expect(config.slotConfig).toEqual(SLOT_CONFIG_NETWORK[name]);
      }
      const zeroSlot = SLOT_CONFIG_NETWORK.preprod.zeroSlot;
      networkConfig("preprod").slotConfig.zeroSlot += 1;
      expect(SLOT_CONFIG_NETWORK.preprod.zeroSlot).toBe(zeroSlot);
      expect(networkConfig("preprod").slotConfig.zeroSlot).toBe(zeroSlot);
    });
    it("returns a given config as it is", () => {
      const config = customNetwork({
        systemStart: 0,
        slotLengthMs: 1000,
        epochLength: 500,
      });
      expect(networkConfig(config)).toBe(config);
    });
    it("does not check a given config", () => {
      const config: NetworkConfig = {
        name: "broken",
        networkId: 0,
        slotConfig: {
          zeroTime: 0,
          zeroSlot: 0,
          slotLength: 0,
          startEpoch: 0,
          epochLength: 0,
        },
      };
      expect(networkConfig(config)).toBe(config);
    });
    it("rejects testnet and unknown names", () => {
      expect(() => networkConfig("testnet" as "mainnet")).toThrow(
        /customNetwork/,
      );
      expect(() => networkConfig("sanchonet" as "mainnet")).toThrow(
        /"mainnet", "preprod", "preview"/,
      );
      expect(() => slotAt("testnet" as "mainnet", 0)).toThrow();
      expect(() => timeAt("testnet" as "mainnet", 0)).toThrow();
    });
  });

  describe("customNetwork", () => {
    const start = "2026-01-01T00:00:00Z";
    const startMs = Date.UTC(2026, 0, 1);

    it("reads the system start from ISO text, POSIX ms and a Date alike", () => {
      for (const systemStart of [start, startMs, new Date(startMs)]) {
        expect(
          customNetwork({ systemStart, slotLengthMs: 100, epochLength: 500 })
            .slotConfig.zeroTime,
        ).toBe(startMs);
      }
    });
    it("keeps what is given", () => {
      expect(
        customNetwork({
          name: "devnet",
          networkId: 1,
          magic: 42,
          systemStart: start,
          slotLengthMs: 100,
          epochLength: 500,
          zeroSlot: 7,
        }),
      ).toEqual({
        name: "devnet",
        networkId: 1,
        magic: 42,
        slotConfig: {
          zeroTime: startMs,
          zeroSlot: 7,
          slotLength: 100,
          startEpoch: 0,
          epochLength: 500,
        },
      });
    });
    it("names an unnamed network custom, gives it id 0 and no magic", () => {
      const config = customNetwork({
        systemStart: start,
        slotLengthMs: 1000,
        epochLength: 500,
      });
      expect(config.name).toBe("custom");
      expect(config.networkId).toBe(0);
      expect("magic" in config).toBe(false);
      expect(config.slotConfig.zeroSlot).toBe(0);
      expect(config.slotConfig.startEpoch).toBe(0);
    });
    it("rejects a slot length that is not a positive integer", () => {
      for (const slotLengthMs of [0, -1000, 1.5, NaN]) {
        expect(() =>
          customNetwork({ systemStart: start, slotLengthMs, epochLength: 500 }),
        ).toThrow(/slot length/);
      }
    });
    it("rejects a system start that gives no finite time", () => {
      for (const systemStart of ["not a time", NaN, Infinity, new Date(NaN)]) {
        expect(() =>
          customNetwork({ systemStart, slotLengthMs: 1000, epochLength: 500 }),
        ).toThrow(/system start/);
      }
    });
  });

  describe("slotAt and timeAt", () => {
    const devnet: NetworkConfig = customNetwork({
      systemStart: 1_000_000,
      slotLengthMs: 100,
      epochLength: 500,
      zeroSlot: 10,
    });

    it("give the slots resolveSlotNo gives", () => {
      expect(slotAt("mainnet", 1723003026421)).toBe(131436735);
      expect(slotAt("preprod", 1723003026421)).toBe(67319826);
      expect(slotAtFromCore("preview", 1723003026421)).toBe(56347026);
    });
    it("round down and up on slot boundaries", () => {
      const cases: [NetworkInput, number][] = [
        ["mainnet", 1000],
        ["preview", 1000],
        [devnet, 100],
      ];
      for (const [network, length] of cases) {
        const slot = slotAt(network, 1723003026421) + 3;
        const begin = timeAt(network, slot);
        expect(slotAt(network, begin, "down")).toBe(slot);
        expect(slotAt(network, begin, "up")).toBe(slot);
        expect(slotAt(network, begin + 1, "down")).toBe(slot);
        expect(slotAt(network, begin + 1, "up")).toBe(slot + 1);
        expect(slotAt(network, begin + length - 1, "down")).toBe(slot);
        expect(slotAt(network, begin + length - 1, "up")).toBe(slot + 1);
        expect(slotAt(network, begin + 1)).toBe(slot);
      }
    });
    it("takes a Date as its time", () => {
      const t = 1723003026421;
      expect(slotAt("preprod", new Date(t))).toBe(slotAt("preprod", t));
      expect(slotAt(devnet, new Date(1_000_250), "up")).toBe(13);
    });
    it("takes a bigint as its time, as the equal number", () => {
      expect(slotAt("preprod", 1755683200000n)).toBe(100000000);
      expect(slotAt("preprod", 1755683200001n, "up")).toBe(100000001);
      expect(slotAt("preprod", 1755683200999n)).toBe(
        slotAt("preprod", 1755683200999),
      );
      expect(slotAt(devnet, -100n)).toBe(slotAt(devnet, -100));
      expect(slotAt("preprod", 2n ** 53n - 1n)).toBe(
        slotAt("preprod", Number.MAX_SAFE_INTEGER),
      );
    });
    it("refuses a bigint time that is not a safe integer", () => {
      for (const time of [2n ** 53n, 2n ** 53n + 1n, -(2n ** 53n)])
        expect(() => slotAt("preprod", time)).toThrow(
          new RegExp(`^The time ${time} is not a safe integer`),
        );
      expect(() => slotAt("preprod", 2n ** 53n)).toThrow(Error);
    });
    it("give the first millisecond of a slot, from a number or a bigint", () => {
      expect(timeAt("preview", 56347026)).toBe(1723003026000);
      expect(timeAt("preview", 56347026n)).toBe(1723003026000);
      expect(timeAt(devnet, 10)).toBe(1_000_000);
      expect(timeAt(devnet, 13n)).toBe(1_000_300);
    });
    it("are plain arithmetic and check nothing", () => {
      expect(slotAt(devnet, NaN)).toBeNaN();
      expect(slotAt(devnet, NaN, "up")).toBeNaN();
      expect(slotAt(devnet, new Date(NaN))).toBeNaN();
      expect(timeAt(devnet, NaN)).toBeNaN();
      // Before zeroTime: a slot before zeroSlot (10)
      expect(slotAt(devnet, 1_000_000 - 100)).toBe(9);
      expect(slotAt(devnet, 1_000_000 - 150)).toBe(8);
      expect(slotAt(devnet, 1_000_000 - 150, "up")).toBe(9);
      expect(timeAt(devnet, 9)).toBe(1_000_000 - 100);
      expect(timeAt(devnet, -1)).toBe(1_000_000 - 1100);
    });
    it("are inverse of each other", () => {
      for (const network of ["mainnet", "preprod", devnet] as NetworkInput[]) {
        for (const t of [1723003026421, 1723003026000, 1790000000999]) {
          const down = slotAt(network, t);
          expect(timeAt(network, down)).toBeLessThanOrEqual(t);
          expect(timeAt(network, down + 1)).toBeGreaterThan(t);
          expect(
            timeAt(network, slotAt(network, t, "up")),
          ).toBeGreaterThanOrEqual(t);
          expect(slotAt(network, timeAt(network, down))).toBe(down);
          expect(slotAt(network, timeAt(network, down), "up")).toBe(down);
        }
      }
    });
  });
});
