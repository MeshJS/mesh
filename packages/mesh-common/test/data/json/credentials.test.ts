import {
  conStr0,
  conStr1,
  maybeStakingHash,
  pubKeyAddress,
  pubKeyHash,
  scriptAddress,
  scriptHash,
} from "../../../src";

const testKeyHash1 = "1e4eb194e3335a0dcc4f5c5d009318167c583bb3b0879d9f718cd9e0";
const testKeyHash2 = "d63a93470bd4d8bb986c02ff8a6043796b91cc397ceb29058f5c9ac0";

describe("Plutus data type", () => {
  describe("maybeStakingHash", () => {
    test("maybeStakingHash - no staking hash", () => {
      const result = maybeStakingHash("");
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({ constructor: 1, fields: [] }),
      );
    });
    test("maybeStakingHash - pub key staking hash", () => {
      const result = maybeStakingHash(testKeyHash1);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(
          conStr0([conStr0([conStr0([pubKeyHash(testKeyHash1)])])]),
        ),
      );
    });
    test("maybeStakingHash - script staking hash", () => {
      const result = maybeStakingHash(testKeyHash1, true);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(
          conStr0([conStr0([conStr1([scriptHash(testKeyHash1)])])]),
        ),
      );
    });
  });
  describe("pubKeyAddress", () => {
    test("pubKeyAddress", () => {
      const result = pubKeyAddress(testKeyHash1);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(
          conStr0([conStr0([pubKeyHash(testKeyHash1)]), maybeStakingHash("")]),
        ),
      );
    });
    test("pubKeyAddress - full base address", () => {
      const result = pubKeyAddress(testKeyHash1, testKeyHash2);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(
          conStr0([
            conStr0([pubKeyHash(testKeyHash1)]),
            maybeStakingHash(testKeyHash2),
          ]),
        ),
      );
    });
  });
  describe("scriptAddress", () => {
    test("scriptAddress", () => {
      const result = scriptAddress(testKeyHash1, testKeyHash2);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(
          conStr0([
            conStr1([pubKeyHash(testKeyHash1)]),
            maybeStakingHash(testKeyHash2),
          ]),
        ),
      );
    });
    test("scriptAddress - full base address", () => {
      const result = scriptAddress(testKeyHash1, testKeyHash2);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(
          conStr0([
            conStr1([pubKeyHash(testKeyHash1)]),
            maybeStakingHash(testKeyHash2),
          ]),
        ),
      );
    });
  });
});
