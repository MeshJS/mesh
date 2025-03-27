import { setInConwayEra } from "@cardano-sdk/core";
import { Hash32ByteBase16 } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import { DEFAULT_V3_COST_MODEL_LIST } from "@meshsdk/common";

import { RedeemerPurpose, Serialization } from "../src";
import { hashScriptData } from "../src/utils/script-data-hash";

describe("ScriptIntegrityHash", () => {
  beforeAll(() => {
    setInConwayEra(true);
  });

  const redeemer0 = {
    index: 0,
    data: Serialization.PlutusData.fromCbor(
      HexBlob(
        "d8799f5820e0628178ceac8f426c13f080db01464c670b2c79a35c9eb7f2617b424b0f9d7200ff",
      ),
    ).toCore(),
    purpose: RedeemerPurpose.mint,
    executionUnits: {
      memory: 185502,
      steps: 62196138,
    },
  };
  const redeemer1 = {
    index: 1,
    data: Serialization.PlutusData.fromCbor(HexBlob("40")).toCore(),
    purpose: RedeemerPurpose.withdrawal,
    executionUnits: {
      memory: 81644,
      steps: 27104449,
    },
  };

  let redeemers = Serialization.Redeemers.fromCore([redeemer0, redeemer1]);

  const datum0 = Serialization.PlutusData.fromCbor(
    HexBlob(
      "d8799f5820e0628178ceac8f426c13f080db01464c670b2c79a35c9eb7f2617b424b0f9d7200ff",
    ),
  );
  const datums = Serialization.CborSet.fromCore(
    [datum0.toCore()],
    Serialization.PlutusData.fromCore,
  );

  let costModels = new Serialization.Costmdls();
  let costModelV3 = Serialization.CostModel.newPlutusV3(
    DEFAULT_V3_COST_MODEL_LIST,
  );
  costModels.insert(costModelV3);

  it("should calculate the correct hash for v3 scripts", async () => {
    const scriptDataHash = hashScriptData(costModels, redeemers);
    expect(scriptDataHash).toEqual(
      Hash32ByteBase16(
        "a43e368f595e7f5cc0513d7c3757e2125a039cab3b301c50cf52b2a56c6a6339",
      ),
    );
  });

  it("should calculate the correct hash when there are datums", async () => {
    const scriptDataHash = hashScriptData(costModels, redeemers, datums);
    expect(scriptDataHash).toEqual(
      Hash32ByteBase16(
        "e4003e3d4453734b7ee5a63da479da5a06174da8832537e1f8272a86e86ea2e0",
      ),
    );
  });

  it("should calculate the correct hash when there are no redeemers", async () => {
    let costModels = new Serialization.Costmdls();
    let costModelV3 = Serialization.CostModel.newPlutusV3(
      DEFAULT_V3_COST_MODEL_LIST,
    );
    costModels.insert(costModelV3);

    const scriptDataHash = hashScriptData(costModels, undefined, datums);
    expect(scriptDataHash).toEqual(
      Hash32ByteBase16(
        "434b8b790f1d8d196331515271ea7a9ec952b24846b5250d60ace39a83318829",
      ),
    );
  });

  it("should calculate the correct hash with multiple datums", async () => {
    const datum1 = Serialization.PlutusData.fromCbor(HexBlob("40"));
    const datums = Serialization.CborSet.fromCore(
      [datum0.toCore(), datum1.toCore()],
      Serialization.PlutusData.fromCore,
    );

    let costModels = new Serialization.Costmdls();
    let costModelV3 = Serialization.CostModel.newPlutusV3(
      DEFAULT_V3_COST_MODEL_LIST,
    );
    costModels.insert(costModelV3);

    const scriptDataHash = hashScriptData(costModels, redeemers, datums);
    expect(scriptDataHash).toEqual(
      Hash32ByteBase16(
        "6f32d12156681ae2d87bb002b5bbdd89077c0a415b051e3d9c19fac066a058b2",
      ),
    );
  });

  it("should calculate the correct hash when there are datums 2", async () => {
    const testDatum = Serialization.PlutusData.fromCbor(HexBlob("d87980"));

    const testRedeemers = Serialization.Redeemers.fromCore([
      {
        index: 0,
        data: Serialization.PlutusData.newBytes(
          Buffer.from("", "hex"),
        ).toCore(),
        purpose: RedeemerPurpose.spend,
        executionUnits: {
          memory: 2201,
          steps: 418163,
        },
      },
    ]);

    const scriptDataHash = hashScriptData(
      costModels,
      testRedeemers,
      Serialization.CborSet.fromCore(
        [testDatum.toCore()],
        Serialization.PlutusData.fromCore,
      ),
    );
    expect(scriptDataHash).toEqual(
      Hash32ByteBase16(
        "78985bcb429aa3ae4a899695d69b59146d99c15b64b09c5c03862c7b2767c6e3",
      ),
    );
  });

  it("should calculate the correct hash when there are datums 3", async () => {
    setInConwayEra(false);
    const a = Serialization.Transaction;
    const testDatum = Serialization.PlutusData.fromCbor(HexBlob("d87980"));

    const testRedeemers = Serialization.Redeemers.fromCore([
      {
        index: 0,
        data: Serialization.PlutusData.newBytes(
          Buffer.from("", "hex"),
        ).toCore(),
        purpose: RedeemerPurpose.spend,
        executionUnits: {
          memory: 2201,
          steps: 418163,
        },
      },
    ]);

    const scriptDataHash = hashScriptData(
      costModels,
      testRedeemers,
      Serialization.CborSet.fromCore(
        [testDatum.toCore()],
        Serialization.PlutusData.fromCore,
      ),
    );
    expect(scriptDataHash).toEqual(
      Hash32ByteBase16(
        "92dc8e163d91890742728c6edb4b17997b6d63d6f8c13143c41779842140e9d3",
      ),
    );
  });
});
