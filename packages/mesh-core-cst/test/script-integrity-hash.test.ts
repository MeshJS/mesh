import { setInConwayEra } from "@cardano-sdk/core";
import { Hash32ByteBase16 } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import { DEFAULT_V3_COST_MODEL_LIST } from "@meshsdk/common";

import { RedeemerPurpose, Serialization } from "../src";
import { hashScriptData } from "../src/utils/script-data-hash";

describe("ScriptIntegrityHash", () => {
  // The expected hashes below are snapshots of this implementation's output, not values taken
  // from chain. They depend on DEFAULT_V*_COST_MODEL_LIST, so they must be regenerated whenever
  // the cost models are updated — they last changed with the epoch-638 cost model update.
  // What IS independently verified is the language-view encoding those cost models flow through:
  // see "language view encoding matches the CDDL spec vectors" at the bottom of this file.
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
        "ad7666218da9f433bdc6e72dfea42f14b3b6f5ea7ade261b1e5c5543b1feb280",
      ),
    );
  });

  it("should calculate the correct hash when there are datums", async () => {
    const scriptDataHash = hashScriptData(costModels, redeemers, datums);
    expect(scriptDataHash).toEqual(
      Hash32ByteBase16(
        "3230002fca6d6029b0cfd541e548ce83652d6089172f6fea9932b187928014e8",
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
        "0a1e15fba0743419dd9bc9b1fc4a549b7879d06fc1b8622ea88bb646fa704eeb",
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
        "67753ae489614bc8e71e12cb043d00e86ffe9a859c7711cf56d9f9b1ce95c0d2",
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
        "7daf0cb375f2c45806cce6a3f81ac1b93836f9124ea3263b51d3432564f2107d",
      ),
    );
  });
});

/**
 * Independent check of the language-view encoding — the step the cost models feed into on their
 * way to the script data hash. Unlike the snapshots above, these vectors are not our own output:
 * they are quoted verbatim from the Conway CDDL (IntersectMBO/cardano-ledger,
 * eras/conway/impl/cddl/data/conway.cddl), which documents the encoding of an all-zero cost model
 * along with PlutusV1's two quirks — the list is indefinite-length and wrapped in a bytestring,
 * and the language id is encoded twice (as a uint key and again as a bytestring).
 *
 * This is what makes updating the snapshots above safe: if the cost models change but these still
 * pass, only the input data moved, not the encoding.
 */
describe("language view encoding matches the CDDL spec vectors", () => {
  it("PlutusV1: indefinite-length list in a bytestring, id encoded twice", () => {
    const costModels = new Serialization.Costmdls();
    costModels.insert(Serialization.CostModel.newPlutusV1(new Array(166).fill(0)));

    // CDDL: "58a89f0000...ff", with the language version encoded as "4100".
    expect(costModels.languageViewsEncoding()).toEqual(
      "a1" + "4100" + "58a8" + "9f" + "00".repeat(166) + "ff",
    );
  });

  it("PlutusV2: definite-length list, id encoded once", () => {
    const costModels = new Serialization.Costmdls();
    costModels.insert(Serialization.CostModel.newPlutusV2(new Array(175).fill(0)));

    // CDDL: "98af0000...", with the language version encoded as "01".
    expect(costModels.languageViewsEncoding()).toEqual(
      "a1" + "01" + "98af" + "00".repeat(175),
    );
  });
});
