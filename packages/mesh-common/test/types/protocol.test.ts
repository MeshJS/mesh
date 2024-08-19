import {
  castProtocol,
  DEFAULT_PROTOCOL_PARAMETERS,
  Protocol,
} from "@meshsdk/common";

describe("Protocol", () => {
  describe("castProtocol", () => {
    it("should get correct new protocol", () => {
      const uncasted: Partial<Record<keyof Protocol, any>> = {
        coinsPerUtxoSize: "0",
        collateralPercent: 150,
        keyDeposit: "2000000",
        maxBlockExMem: "62000000",
        maxBlockExSteps: "20000000000",
        maxBlockHeaderSize: 1100,
        maxBlockSize: 65536,
        maxCollateralInputs: 3,
        maxTxExMem: "14000000",
        maxTxExSteps: "10000000000",
        maxTxSize: 16384,
        maxValSize: "5000",
        minFeeA: 0,
        minFeeB: 0,
        minPoolCost: "340000000",
        poolDeposit: "500000000",
        priceMem: 0,
        priceStep: 0,
      };

      const correct: Protocol = {
        coinsPerUtxoSize: 0,
        collateralPercent: 150,
        keyDeposit: 2000000,
        maxBlockExMem: "62000000",
        maxBlockExSteps: "20000000000",
        maxBlockHeaderSize: 1100,
        maxBlockSize: 65536,
        maxCollateralInputs: 3,
        maxTxExMem: "14000000",
        maxTxExSteps: "10000000000",
        maxTxSize: 16384,
        maxValSize: 5000,
        minFeeA: 0,
        minFeeB: 0,
        minPoolCost: "340000000",
        poolDeposit: 500000000,
        priceMem: 0,
        priceStep: 0,
        epoch: DEFAULT_PROTOCOL_PARAMETERS.epoch,
        decentralisation: DEFAULT_PROTOCOL_PARAMETERS.decentralisation,
        minFeeRefScriptCostPerByte: 15,
      };

      const casted = castProtocol(uncasted);

      expect(casted.coinsPerUtxoSize).toBe(correct.coinsPerUtxoSize);
      expect(casted.collateralPercent).toBe(correct.collateralPercent);
      expect(casted.keyDeposit).toBe(correct.keyDeposit);
      expect(casted.maxBlockExMem).toBe(correct.maxBlockExMem);
      expect(casted.maxBlockExSteps).toBe(correct.maxBlockExSteps);
      expect(casted.maxBlockHeaderSize).toBe(correct.maxBlockHeaderSize);
      expect(casted.maxBlockSize).toBe(correct.maxBlockSize);
      expect(casted.maxCollateralInputs).toBe(correct.maxCollateralInputs);
      expect(casted.maxTxExMem).toBe(correct.maxTxExMem);
      expect(casted.maxTxExSteps).toBe(correct.maxTxExSteps);
      expect(casted.maxTxSize).toBe(correct.maxTxSize);
      expect(casted.maxValSize).toBe(correct.maxValSize);
      expect(casted.minFeeA).toBe(correct.minFeeA);
      expect(casted.minFeeB).toBe(correct.minFeeB);
      expect(casted.minPoolCost).toBe(correct.minPoolCost);
      expect(casted.poolDeposit).toBe(correct.poolDeposit);
      expect(casted.priceMem).toBe(correct.priceMem);
      expect(casted.priceStep).toBe(correct.priceStep);
      expect(casted.epoch).toBe(correct.epoch);
      expect(casted.decentralisation).toBe(correct.decentralisation);
    });
  });
});
