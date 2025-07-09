import {
  PlutusScript,
  ScriptSource,
  SimpleScriptSourceInfo,
} from "@meshsdk/common";
import { scriptSourceToObj, simpleScriptSourceToObj } from "@meshsdk/core-csl";

describe("Script Adaptor - toObj", () => {
  describe("scriptSourceToObj", () => {
    test("should convert a 'Provided' ScriptSource to object representation", () => {
      // Create a Provided ScriptSource
      const scriptSource: ScriptSource = {
        type: "Provided",
        script: {
          code: "5251010000322253330034a229309b2b2b9a01",
          version: "V2",
        } as PlutusScript,
      };

      // Convert to object
      const result = scriptSourceToObj(scriptSource);

      // Verify the result
      expect(result).toEqual({
        providedScriptSource: {
          scriptCbor: "5251010000322253330034a229309b2b2b9a01",
          languageVersion: "v2",
        },
      });
    });

    test("should convert an 'Inline' ScriptSource to object representation", () => {
      // Create an Inline ScriptSource
      const scriptSource: ScriptSource = {
        type: "Inline",
        txHash:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        txIndex: 1,
        scriptHash: "e09d36c79dec9bd1b3d9e152247701cd0bb860b5ebfd1de8abb6735a",
        version: "V1",
        scriptSize: "100",
      };

      // Convert to object
      const result = scriptSourceToObj(scriptSource);

      // Verify the result
      expect(result).toEqual({
        inlineScriptSource: {
          refTxIn: {
            txHash:
              "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            txIndex: 1,
          },
          scriptHash:
            "e09d36c79dec9bd1b3d9e152247701cd0bb860b5ebfd1de8abb6735a",
          languageVersion: "v1",
          scriptSize: BigInt(100),
        },
      });
    });

    test("should handle missing optional fields in 'Inline' ScriptSource", () => {
      // Create an Inline ScriptSource with missing optional fields
      const scriptSource: ScriptSource = {
        type: "Inline",
        txHash:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        txIndex: 1,
        version: "V1",
      };

      // Convert to object
      const result = scriptSourceToObj(scriptSource);

      // Verify the result
      expect(result).toEqual({
        inlineScriptSource: {
          refTxIn: {
            txHash:
              "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            txIndex: 1,
          },
          scriptHash: "",
          languageVersion: "v1",
          scriptSize: BigInt(0),
        },
      });
    });
  });

  describe("simpleScriptSourceToObj", () => {
    test("should convert a 'Provided' SimpleScriptSourceInfo to object representation", () => {
      // Create a Provided SimpleScriptSourceInfo
      const scriptSource: SimpleScriptSourceInfo = {
        type: "Provided",
        scriptCode:
          "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
      };

      // Convert to object
      const result = simpleScriptSourceToObj(scriptSource);

      // Verify the result
      expect(result).toEqual({
        providedSimpleScriptSource: {
          scriptCbor:
            "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
        },
      });
    });

    test("should convert an 'Inline' SimpleScriptSourceInfo to object representation", () => {
      // Create an Inline SimpleScriptSourceInfo
      const scriptSource: SimpleScriptSourceInfo = {
        type: "Inline",
        txHash:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        txIndex: 1,
        simpleScriptHash:
          "e09d36c79dec9bd1b3d9e152247701cd0bb860b5ebfd1de8abb6735a",
      };

      // Convert to object
      const result = simpleScriptSourceToObj(scriptSource);

      // Verify the result
      expect(result).toEqual({
        inlineSimpleScriptSource: {
          refTxIn: {
            txHash:
              "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            txIndex: 1,
          },
          simpleScriptHash:
            "e09d36c79dec9bd1b3d9e152247701cd0bb860b5ebfd1de8abb6735a",
        },
      });
    });

    test("should handle missing optional fields in 'Inline' SimpleScriptSourceInfo", () => {
      // Create an Inline SimpleScriptSourceInfo with missing optional fields
      const scriptSource: SimpleScriptSourceInfo = {
        type: "Inline",
        txHash:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        txIndex: 1,
      };

      // Convert to object
      const result = simpleScriptSourceToObj(scriptSource);

      // Verify the result
      expect(result).toEqual({
        inlineSimpleScriptSource: {
          refTxIn: {
            txHash:
              "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            txIndex: 1,
          },
          simpleScriptHash: "",
        },
      });
    });
  });
});
