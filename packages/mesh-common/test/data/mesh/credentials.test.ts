import {
  maybeStakingHash,
  mMaybeStakingHash,
  mPubKeyAddress,
  mScriptAddress,
  pubKeyAddress,
  scriptAddress,
} from "@meshsdk/common";

import { serializeData } from "./common";

const testKeyHash1 = "1e4eb194e3335a0dcc4f5c5d009318167c583bb3b0879d9f718cd9e0";
const testKeyHash2 = "d63a93470bd4d8bb986c02ff8a6043796b91cc397ceb29058f5c9ac0";

describe("Plutus data type", () => {
  describe("maybeStakingHash", () => {
    test("maybeStakingHash - no staking hash", () => {
      const [meshCbor, jsonCbor] = serializeData(
        mMaybeStakingHash(""),
        maybeStakingHash(""),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
    test("maybeStakingHash - pub key staking hash", () => {
      const [meshCbor, jsonCbor] = serializeData(
        mMaybeStakingHash(testKeyHash1),
        maybeStakingHash(testKeyHash1),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
    test("maybeStakingHash - script staking hash", () => {
      const [meshCbor, jsonCbor] = serializeData(
        mMaybeStakingHash(testKeyHash1, true),
        maybeStakingHash(testKeyHash1, true),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
  });
  describe("pubKeyAddress", () => {
    test("pubKeyAddress", () => {
      const [meshCbor, jsonCbor] = serializeData(
        mPubKeyAddress(testKeyHash1),
        pubKeyAddress(testKeyHash1),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
    test("pubKeyAddress - full base address", () => {
      const [meshCbor, jsonCbor] = serializeData(
        mPubKeyAddress(testKeyHash1, testKeyHash2),
        pubKeyAddress(testKeyHash1, testKeyHash2),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
  });
  describe("scriptAddress", () => {
    test("scriptAddress", () => {
      const [meshCbor, jsonCbor] = serializeData(
        mScriptAddress(testKeyHash1),
        scriptAddress(testKeyHash1),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
    test("scriptAddress - full base address", () => {
      const [meshCbor, jsonCbor] = serializeData(
        mScriptAddress(testKeyHash1, testKeyHash2),
        scriptAddress(testKeyHash1, testKeyHash2),
      );
      expect(meshCbor).toBe(jsonCbor);
    });
  });
});
