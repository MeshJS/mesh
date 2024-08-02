import {
  assetClass,
  mAssetClass,
  mOutputReference,
  mTxOutRef,
  outputReference,
  txOutRef,
} from "@meshsdk/common";

import { serializeData } from "./common";

const testHash = "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc81700";
const testTxHash =
  "a0bd47e8938e7c41d4c1d7c22033892319d28f86fdace791d45c51946553791b";
describe("Plutus data type", () => {
  describe("assetClass", () => {
    test("assetClass", () => {
      const [meshCbor, jsonCbor] = serializeData(
        mAssetClass(testHash, "abcd"),
        assetClass(testHash, "abcd"),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
  });
  describe("outputReference", () => {
    test("outputReference", () => {
      const [meshCbor, jsonCbor] = serializeData(
        mOutputReference(testTxHash, 1),
        outputReference(testTxHash, 1),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
    test("outputReference - invalid length", () => {
      expect(() => mOutputReference(testHash, 1)).toThrow;
    });
  });
  describe("txOutRef", () => {
    test("txOutRef", () => {
      const [meshCbor, jsonCbor] = serializeData(
        mTxOutRef(testTxHash, 1),
        txOutRef(testTxHash, 1),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
  });
});
