import { UTxO } from "@meshsdk/common";
import { utxoFromObj, utxoToObj } from "@meshsdk/core-csl";

describe("utxo.ts", () => {
  describe("utxoFromObj", () => {
    it("should convert basic UTxO object with required fields", () => {
      const obj = {
        input: {
          outputIndex: 1,
          txHash: "1234567890abcdef",
        },
        output: {
          address: "addr_test1234",
          amount: [{ unit: "lovelace", quantity: "1000000" }],
        },
      };

      const result = utxoFromObj(obj);

      expect(result).toEqual({
        input: {
          outputIndex: 1,
          txHash: "1234567890abcdef",
        },
        output: {
          address: "addr_test1234",
          amount: [{ unit: "lovelace", quantity: "1000000" }],
        },
      });
    });

    it("should handle UTxO object with all optional fields", () => {
      const obj = {
        input: {
          outputIndex: 2,
          txHash: "abcdef1234567890",
        },
        output: {
          address: "addr_test5678",
          amount: [
            { unit: "lovelace", quantity: "2000000" },
            { unit: "token1", quantity: "100" },
          ],
          dataHash: "datahash123",
          plutusData: "plutusdata123",
          scriptRef: "scriptref123",
          scriptHash: "scripthash123",
        },
      };

      const result = utxoFromObj(obj);

      expect(result).toEqual({
        input: {
          outputIndex: 2,
          txHash: "abcdef1234567890",
        },
        output: {
          address: "addr_test5678",
          amount: [
            { unit: "lovelace", quantity: "2000000" },
            { unit: "token1", quantity: "100" },
          ],
          dataHash: "datahash123",
          plutusData: "plutusdata123",
          scriptRef: "scriptref123",
          scriptHash: "scripthash123",
        },
      });
    });

    it("should handle UTxO object with missing optional fields", () => {
      const obj = {
        input: {
          outputIndex: 3,
          txHash: "def0123456789abc",
        },
        output: {
          address: "addr_test9012",
          amount: [{ unit: "lovelace", quantity: "3000000" }],
          // Optional fields omitted
        },
      };

      const result = utxoFromObj(obj);

      expect(result).toEqual({
        input: {
          outputIndex: 3,
          txHash: "def0123456789abc",
        },
        output: {
          address: "addr_test9012",
          amount: [{ unit: "lovelace", quantity: "3000000" }],
          // Optional fields should be undefined
          dataHash: undefined,
          plutusData: undefined,
          scriptRef: undefined,
          scriptHash: undefined,
        },
      });
    });
  });

  describe("round trip conversion", () => {
    it("should maintain data integrity when converting back and forth", () => {
      const originalUtxo: UTxO = {
        input: {
          outputIndex: 4,
          txHash: "0123456789abcdef",
        },
        output: {
          address: "addr_test_roundtrip",
          amount: [
            { unit: "lovelace", quantity: "4000000" },
            { unit: "token2", quantity: "200" },
          ],
          dataHash: "roundtripdatahash",
          plutusData: "roundtripplusdata",
          scriptRef: "roundtripscriptref",
          scriptHash: "roundtripscripthash",
        },
      };

      // Convert UTxO to object representation
      const objRepresentation = utxoToObj(originalUtxo);

      // Convert back to UTxO
      const roundTrippedUtxo = utxoFromObj(objRepresentation);

      // Verify the result matches the original
      expect(roundTrippedUtxo).toEqual(originalUtxo);
    });

    it("should maintain data integrity with minimal fields", () => {
      const minimalUtxo: UTxO = {
        input: {
          outputIndex: 5,
          txHash: "minimal0123456789",
        },
        output: {
          address: "addr_test_minimal",
          amount: [{ unit: "lovelace", quantity: "1000000" }],
        },
      };

      const objRepresentation = utxoToObj(minimalUtxo);
      const roundTrippedUtxo = utxoFromObj(objRepresentation);

      expect(roundTrippedUtxo).toEqual(minimalUtxo);
    });
  });
});
