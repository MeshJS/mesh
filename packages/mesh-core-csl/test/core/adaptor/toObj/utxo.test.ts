import { mConStr0, UTxO } from "@meshsdk/common";
import { resolveDataHash, serializeData } from "@meshsdk/core";
import { utxoToObj } from "@meshsdk/core-csl";

describe("utxo.ts Tests", () => {
  describe("utxoToObj", () => {
    it("should convert UTxO with all fields present", () => {
      const utxo: UTxO = {
        input: {
          outputIndex: 1,
          txHash:
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
        output: {
          address:
            "addr_test1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          amount: [
            { unit: "lovelace", quantity: "1000000" },
            { unit: "1234567890abcdef.TestToken", quantity: "1" },
          ],
          dataHash:
            "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          plutusData: "8201a1",
          scriptRef: "8201a2",
          scriptHash: "8201a3",
        },
      };

      const result = utxoToObj(utxo);

      expect(result).toEqual({
        input: {
          outputIndex: 1,
          txHash:
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
        output: {
          address:
            "addr_test1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          amount: [
            { unit: "lovelace", quantity: "1000000" },
            { unit: "1234567890abcdef.TestToken", quantity: "1" },
          ],
          dataHash:
            "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          plutusData: "8201a1",
          scriptRef: "8201a2",
          scriptHash: "8201a3",
        },
      });
    });

    it("should convert UTxO with only required fields", () => {
      const utxo: UTxO = {
        input: {
          outputIndex: 0,
          txHash:
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
        output: {
          address:
            "addr_test1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          amount: [{ unit: "lovelace", quantity: "1000000" }],
        },
      };

      const result = utxoToObj(utxo);

      expect(result).toEqual({
        input: {
          outputIndex: 0,
          txHash:
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
        output: {
          address:
            "addr_test1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          amount: [{ unit: "lovelace", quantity: "1000000" }],
          dataHash: null,
          plutusData: null,
          scriptRef: null,
          scriptHash: null,
        },
      });
    });

    it("should handle UTxO with max safe integer values", () => {
      const utxo: UTxO = {
        input: {
          outputIndex: 3,
          txHash:
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
        output: {
          address:
            "addr_test1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          amount: [
            { unit: "lovelace", quantity: "9007199254740991" }, // Max safe integer
            { unit: "1234567890abcdef.Token1", quantity: "1" },
            { unit: "1234567890abcdef.Token2", quantity: "0" },
            {
              unit: "1234567890abcdef.Token3",
              quantity: "18446744073709551615",
            }, // Max uint64
          ],
        },
      };

      const result = utxoToObj(utxo);

      expect(result).toEqual({
        input: {
          outputIndex: 3,
          txHash:
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
        output: {
          address:
            "addr_test1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          amount: [
            { unit: "lovelace", quantity: "9007199254740991" },
            { unit: "1234567890abcdef.Token1", quantity: "1" },
            { unit: "1234567890abcdef.Token2", quantity: "0" },
            {
              unit: "1234567890abcdef.Token3",
              quantity: "18446744073709551615",
            },
          ],
          dataHash: null,
          plutusData: null,
          scriptRef: null,
          scriptHash: null,
        },
      });
    });

    it("should handle UTxO with explicit undefined values for optional fields", () => {
      const plutusData = serializeData(mConStr0([]));
      const dataHash = resolveDataHash(mConStr0([]));

      const utxo: UTxO = {
        input: {
          outputIndex: 2,
          txHash:
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
        output: {
          address:
            "addr_test1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          amount: [{ unit: "lovelace", quantity: "2000000" }],
          dataHash,
          plutusData,
          scriptRef: undefined,
          scriptHash: undefined,
        },
      };

      const result = utxoToObj(utxo);

      expect(result).toEqual({
        input: {
          outputIndex: 2,
          txHash:
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
        output: {
          address:
            "addr_test1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          amount: [{ unit: "lovelace", quantity: "2000000" }],
          dataHash,
          plutusData,
          scriptRef: null,
          scriptHash: null,
        },
      });
    });
  });
});
