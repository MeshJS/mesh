import {
  BlockfrostProvider,
  resolveEpochNo,
  resolveSlotNo,
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
});
