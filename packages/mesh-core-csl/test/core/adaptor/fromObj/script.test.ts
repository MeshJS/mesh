import {
  PlutusScript,
  ScriptSource,
  SimpleScriptSourceInfo,
} from "@meshsdk/common";
import {
  scriptSourceFromObj,
  scriptSourceToObj,
  simpleScriptSourceFromObj,
  simpleScriptSourceToObj,
} from "@meshsdk/core-csl";

describe("Script Adaptor - fromObj", () => {
  describe("scriptSourceFromObj", () => {
    test("should convert a 'providedScriptSource' object to ScriptSource", () => {
      // Create an object representation
      const objRepresentation = {
        providedScriptSource: {
          scriptCbor: "5251010000322253330034a229309b2b2b9a01",
          languageVersion: "v2",
        },
      };

      // Convert to ScriptSource
      const result = scriptSourceFromObj(objRepresentation);

      // Verify the result
      expect(result).toEqual({
        type: "Provided",
        script: {
          code: "5251010000322253330034a229309b2b2b9a01",
          version: "V2",
        },
      });
    });

    test("should convert an 'inlineScriptSource' object to ScriptSource", () => {
      // Create an object representation
      const objRepresentation = {
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
      };

      // Convert to ScriptSource
      const result = scriptSourceFromObj(objRepresentation);

      // Verify the result
      expect(result).toEqual({
        type: "Inline",
        txHash:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        txIndex: 1,
        scriptHash: "e09d36c79dec9bd1b3d9e152247701cd0bb860b5ebfd1de8abb6735a",
        version: "V1",
        scriptSize: "100",
      });
    });

    test("should handle empty optional fields in 'inlineScriptSource' object", () => {
      // Create an object representation with empty optional fields
      const objRepresentation = {
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
      };

      // Convert to ScriptSource
      const result = scriptSourceFromObj(objRepresentation);

      // Verify the result
      expect(result).toEqual({
        type: "Inline",
        txHash:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        txIndex: 1,
        scriptHash: undefined,
        version: "V1",
        scriptSize: "0",
      });
    });

    test("should throw error for unknown script source format", () => {
      // Create an invalid object representation
      const objRepresentation = {
        invalidScriptSource: {
          someField: "someValue",
        },
      };

      // Verify that it throws an error
      expect(() => scriptSourceFromObj(objRepresentation)).toThrow(
        "scriptSourceFromObj: Unknown script source format:",
      );
    });
  });

  describe("simpleScriptSourceFromObj", () => {
    test("should convert a 'providedSimpleScriptSource' object to SimpleScriptSourceInfo", () => {
      // Create an object representation
      const objRepresentation = {
        providedSimpleScriptSource: {
          scriptCbor:
            "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
        },
      };

      // Convert to SimpleScriptSourceInfo
      const result = simpleScriptSourceFromObj(objRepresentation);

      // Verify the result
      expect(result).toEqual({
        type: "Provided",
        scriptCode:
          "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
      });
    });

    test("should convert an 'inlineSimpleScriptSource' object to SimpleScriptSourceInfo", () => {
      // Create an object representation
      const objRepresentation = {
        inlineSimpleScriptSource: {
          refTxIn: {
            txHash:
              "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            txIndex: 1,
          },
          simpleScriptHash:
            "e09d36c79dec9bd1b3d9e152247701cd0bb860b5ebfd1de8abb6735a",
        },
      };

      // Convert to SimpleScriptSourceInfo
      const result = simpleScriptSourceFromObj(objRepresentation);

      // Verify the result
      expect(result).toEqual({
        type: "Inline",
        txHash:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        txIndex: 1,
        simpleScriptHash:
          "e09d36c79dec9bd1b3d9e152247701cd0bb860b5ebfd1de8abb6735a",
      });
    });

    test("should handle empty optional fields in 'inlineSimpleScriptSource' object", () => {
      // Create an object representation with empty optional fields
      const objRepresentation = {
        inlineSimpleScriptSource: {
          refTxIn: {
            txHash:
              "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            txIndex: 1,
          },
          simpleScriptHash: "",
        },
      };

      // Convert to SimpleScriptSourceInfo
      const result = simpleScriptSourceFromObj(objRepresentation);

      // Verify the result
      expect(result).toEqual({
        type: "Inline",
        txHash:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        txIndex: 1,
        simpleScriptHash: undefined,
      });
    });

    test("should throw error for unknown simple script source format", () => {
      // Create an invalid object representation
      const objRepresentation = {
        invalidSimpleScriptSource: {
          someField: "someValue",
        },
      };

      // Verify that it throws an error
      expect(() => simpleScriptSourceFromObj(objRepresentation)).toThrow(
        "simpleScriptSourceFromObj: Unknown simple script source format:",
      );
    });
  });

  // Round-trip conversion tests
  describe("Round trip conversion", () => {
    test("should get back the original ScriptSource after converting to object and back", () => {
      // Start with a ScriptSource
      const original: ScriptSource = {
        type: "Provided",
        script: {
          code: "5251010000322253330034a229309b2b2b9a01",
          version: "V2",
        } as PlutusScript,
      };

      // Convert to object and back
      const objRepresentation = scriptSourceToObj(original);
      const roundTrip = scriptSourceFromObj(objRepresentation);

      // Verify
      expect(roundTrip).toEqual(original);
    });

    test("should get back the original SimpleScriptSourceInfo after converting to object and back", () => {
      // Start with a SimpleScriptSourceInfo
      const original: SimpleScriptSourceInfo = {
        type: "Provided",
        scriptCode:
          "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
      };

      // Convert to object and back
      const objRepresentation = simpleScriptSourceToObj(original);
      const roundTrip = simpleScriptSourceFromObj(objRepresentation);

      // Verify
      expect(roundTrip).toEqual(original);
    });

    test("should handle inline script sources in round-trip conversion", () => {
      // Start with an inline ScriptSource
      const original: ScriptSource = {
        type: "Inline",
        txHash:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        txIndex: 1,
        scriptHash: "e09d36c79dec9bd1b3d9e152247701cd0bb860b5ebfd1de8abb6735a",
        version: "V1",
        scriptSize: "100",
      };

      // Convert to object and back
      const objRepresentation = scriptSourceToObj(original);
      const roundTrip = scriptSourceFromObj(objRepresentation);

      // Verify
      expect(roundTrip).toEqual(original);
    });

    test("should handle inline simple script sources in round-trip conversion", () => {
      // Start with an inline SimpleScriptSourceInfo
      const original: SimpleScriptSourceInfo = {
        type: "Inline",
        txHash:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        txIndex: 1,
        simpleScriptHash:
          "e09d36c79dec9bd1b3d9e152247701cd0bb860b5ebfd1de8abb6735a",
      };

      // Convert to object and back
      const objRepresentation = simpleScriptSourceToObj(original);
      const roundTrip = simpleScriptSourceFromObj(objRepresentation);

      // Verify
      expect(roundTrip).toEqual(original);
    });
  });
});
