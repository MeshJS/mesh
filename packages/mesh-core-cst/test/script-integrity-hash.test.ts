import { Hash32ByteBase16 } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import { DEFAULT_V3_COST_MODEL_LIST } from "@meshsdk/common";

import { RedeemerPurpose, Serialization } from "../src";
import { hashScriptData } from "../src/utils/script-data-hash";

describe("ScriptIntegrityHash", () => {
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

  let redeemers = [redeemer0, redeemer1].map((redeemer) => {
    return Serialization.Redeemer.fromCore(redeemer);
  });

  const datum0 = Serialization.PlutusData.fromCbor(
    HexBlob(
      "d8799f5820e0628178ceac8f426c13f080db01464c670b2c79a35c9eb7f2617b424b0f9d7200ff",
    ),
  );
  const datums = [datum0];

  it("should calculate the correct hash for v3 scripts", async () => {
    let costModels = new Serialization.Costmdls();
    let costModelV3 = Serialization.CostModel.newPlutusV3(
      DEFAULT_V3_COST_MODEL_LIST,
    );
    costModels.insert(costModelV3);

    const scriptDataHash = hashScriptData(costModels, redeemers);
    expect(scriptDataHash).toEqual(
      Hash32ByteBase16(
        "a43e368f595e7f5cc0513d7c3757e2125a039cab3b301c50cf52b2a56c6a6339",
      ),
    );
  });

  it("should calculate the correct hash when there are datums", async () => {
    let costModels = new Serialization.Costmdls();
    let costModelV3 = Serialization.CostModel.newPlutusV3(
      DEFAULT_V3_COST_MODEL_LIST,
    );
    costModels.insert(costModelV3);

    const scriptDataHash = hashScriptData(costModels, redeemers, datums);
    expect(scriptDataHash).toEqual(
      Hash32ByteBase16(
        "d3883c214f7d7b5a03e8982c2ce16c8acad5cd6d7e9ab3d256343ffbea239001",
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
        "9df6d7109e989e1e7276f517a87031e109bbfbe808b0ae994b3e3996acebc895",
      ),
    );
  });

  it("should calculate the correct hash with multiple datums", async () => {
    const datum1 = Serialization.PlutusData.fromCbor(HexBlob("40"));
    const datums = [datum0, datum1];

    let costModels = new Serialization.Costmdls();
    let costModelV3 = Serialization.CostModel.newPlutusV3(
      DEFAULT_V3_COST_MODEL_LIST,
    );
    costModels.insert(costModelV3);

    const scriptDataHash = hashScriptData(costModels, redeemers, datums);
    expect(scriptDataHash).toEqual(
      Hash32ByteBase16(
        "372b41e538bcdcfe8ae62f613b18ae34f620391fa626a8887265f00805cd4c18",
      ),
    );
  });
});
