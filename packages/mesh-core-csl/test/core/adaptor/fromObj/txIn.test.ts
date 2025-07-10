import { mConStr0, TxIn } from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import {
  collateralTxInFromObj,
  txInFromObj,
  txInParameterFromObj,
  txInParameterToObj,
  txInToObj,
} from "@meshsdk/core-csl";

describe("txIn.ts Round Trip Tests", () => {
  const basicTxInParameter = {
    txHash: "1234567890abcdef",
    txIndex: 0,
    amount: [{ unit: "lovelace", quantity: "1000000" }],
    address: "addr_test1234",
  };

  describe("TxInParameter Round Trip", () => {
    it("should maintain all fields in round trip with full data", () => {
      const serialized = txInParameterToObj(basicTxInParameter);
      const deserialized = txInParameterFromObj(serialized);

      expect(deserialized).toEqual(basicTxInParameter);
    });

    it("should handle minimal parameters in round trip", () => {
      const minimalParam = {
        txHash: "1234567890abcdef",
        txIndex: 0,
      };

      const serialized = txInParameterToObj(minimalParam);
      const deserialized = txInParameterFromObj(serialized);

      expect(deserialized).toEqual(minimalParam);
    });
  });

  describe("Script TxIn Round Trip", () => {
    it("should maintain script input with provided datum", () => {
      const originalInput: TxIn = {
        type: "Script",
        txIn: basicTxInParameter,
        scriptTxIn: {
          scriptSource: {
            type: "Inline",
            txHash: "abc123",
            txIndex: 1,
            scriptHash: "def456",
            version: "V1",
            scriptSize: "100",
          },
          datumSource: {
            type: "Provided",
            data: {
              type: "CBOR",
              content: serializeData(mConStr0([])),
            },
          },
          redeemer: {
            data: {
              type: "CBOR",
              content: serializeData(mConStr0([])),
            },
            exUnits: {
              mem: 1000000,
              steps: 500000000,
            },
          },
        },
      };

      const serialized = txInToObj(originalInput);
      const deserialized = txInFromObj(serialized);

      expect(deserialized).toEqual(originalInput);
    });

    it("should maintain script input with inline datum", () => {
      const originalInput: TxIn = {
        type: "Script",
        txIn: basicTxInParameter,
        scriptTxIn: {
          scriptSource: {
            type: "Inline",
            txHash: "abc123",
            txIndex: 1,
            scriptHash: "def456",
            version: "V1",
            scriptSize: "100",
          },
          datumSource: {
            type: "Inline",
            txHash: "ghi789",
            txIndex: 2,
          },
        },
      };

      const serialized = txInToObj(originalInput);
      const deserialized = txInFromObj(serialized);

      expect(deserialized).toEqual(originalInput);
    });
  });

  describe("SimpleScript TxIn Round Trip", () => {
    it("should maintain simple script with inline source", () => {
      const originalInput: TxIn = {
        type: "SimpleScript",
        txIn: basicTxInParameter,
        simpleScriptTxIn: {
          scriptSource: {
            type: "Inline",
            txHash: "abc123",
            txIndex: 1,
            simpleScriptHash: "def456",
            scriptSize: "100",
          },
        },
      };

      const serialized = txInToObj(originalInput);
      const deserialized = txInFromObj(serialized);

      expect(deserialized).toEqual(originalInput);
    });

    it("should maintain simple script with provided source", () => {
      const originalInput: TxIn = {
        type: "SimpleScript",
        txIn: basicTxInParameter,
        simpleScriptTxIn: {
          scriptSource: {
            type: "Provided",
            scriptCode:
              "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
          },
        },
      };

      const serialized = txInToObj(originalInput);
      const deserialized = txInFromObj(serialized);

      expect(deserialized).toEqual(originalInput);
    });
  });

  describe("PubKey TxIn Round Trip", () => {
    it("should maintain pubkey input data", () => {
      const originalInput: TxIn = {
        type: "PubKey",
        txIn: basicTxInParameter,
      };

      const serialized = txInToObj(originalInput);
      const deserialized = txInFromObj(serialized);

      expect(deserialized).toEqual(originalInput);
    });
  });

  describe("Edge Cases Round Trip", () => {
    it("should handle txIn with null optional fields", () => {
      const minimalInput: TxIn = {
        type: "PubKey",
        txIn: {
          txHash: "1234567890abcdef",
          txIndex: 0,
        },
      };

      const serialized = txInToObj(minimalInput);
      const deserialized = txInFromObj(serialized);

      expect(deserialized).toEqual(minimalInput);
    });

    it("should handle complex asset amounts", () => {
      const inputWithComplexAssets: TxIn = {
        type: "PubKey",
        txIn: {
          txHash: "1234567890abcdef",
          txIndex: 0,
          amount: [
            { unit: "lovelace", quantity: "1000000" },
            {
              unit: "1234567890abcdef.TestToken",
              quantity: "9007199254740991",
            },
            { unit: "custom.token", quantity: "0" },
          ],
          address: "addr_test1234",
        },
      };

      const serialized = txInToObj(inputWithComplexAssets);
      const deserialized = txInFromObj(serialized);

      expect(deserialized).toEqual(inputWithComplexAssets);
    });
  });

  describe("Complex Script TxIn Round Trip", () => {
    it("should handle script input with complex redeemer data", () => {
      const complexInput: TxIn = {
        type: "Script",
        txIn: basicTxInParameter,
        scriptTxIn: {
          scriptSource: {
            type: "Inline",
            txHash: "abc123",
            txIndex: 1,
            scriptHash: "def456",
            version: "V1",
            scriptSize: "100",
          },
          datumSource: {
            type: "Inline",
            txHash: "def456",
            txIndex: 2,
          },
          redeemer: {
            data: {
              type: "CBOR",
              content: serializeData(
                JSON.stringify({
                  constructor: 0,
                  fields: [
                    { bytes: "deadbeef" },
                    { int: 12345 },
                    {
                      list: [
                        { constructor: 1, fields: [] },
                        { map: [{ k: { bytes: "aaaa" }, v: { int: 42 } }] },
                      ],
                    },
                  ],
                }),
                "JSON",
              ),
            },
            exUnits: {
              mem: 1000000,
              steps: 500000000,
            },
          },
        },
      };

      const serialized = txInToObj(complexInput);
      const deserialized = txInFromObj(serialized);

      expect(deserialized).toEqual(complexInput);
    });

    it("should handle script input with large scriptSize", () => {
      const largeScriptInput: TxIn = {
        type: "Script",
        txIn: basicTxInParameter,
        scriptTxIn: {
          scriptSource: {
            type: "Inline",
            txHash: "abc123",
            txIndex: 1,
            scriptHash: "def456",
            version: "V2",
            scriptSize: "18446744073709551615", // Max uint64
          },
        },
      };

      const serialized = txInToObj(largeScriptInput);
      const deserialized = txInFromObj(serialized);

      expect(deserialized).toEqual(largeScriptInput);
    });
  });

  describe("Collateral TxIn Round Trip", () => {
    it("should maintain collateral input data integrity", () => {
      const originalCollateralInput: TxIn = {
        type: "PubKey",
        txIn: {
          txHash:
            "80fff8d27e8dffec05ac773f22140cf86d8e30a0243e7df6849b74633d79e007",
          txIndex: 5,
          amount: [{ unit: "lovelace", quantity: "5000000" }],
          address: "addr_test1234",
          scriptSize: 0,
        },
      };

      // Convert TxIn to collateral object
      const collateralObj = {
        txIn: txInParameterToObj(originalCollateralInput.txIn),
      };

      // Convert back to TxIn
      const reconstructedTxIn = collateralTxInFromObj(collateralObj);

      expect(reconstructedTxIn).toEqual(originalCollateralInput);
    });
  });
});
