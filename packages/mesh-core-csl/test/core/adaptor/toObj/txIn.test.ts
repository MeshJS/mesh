import {
  mConStr0,
  ScriptSource,
  ScriptTxInParameter,
  TxIn,
} from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import {
  collateralTxInToObj,
  scriptTxInParameterToObj,
  simpleScriptTxInParameterToObj,
  txInParameterToObj,
  txInToObj,
} from "@meshsdk/core-csl";

describe("txIn.ts", () => {
  const basicTxInParameter = {
    txHash: "1234567890abcdef",
    txIndex: 0,
    amount: [{ unit: "lovelace", quantity: "1000000" }],
    address: "addr_test1234",
  };

  describe("txInParameterToObj", () => {
    it("should convert txInParameter to object with all fields", () => {
      const result = txInParameterToObj(basicTxInParameter);

      expect(result).toEqual({
        txHash: basicTxInParameter.txHash,
        txIndex: basicTxInParameter.txIndex,
        amount: basicTxInParameter.amount,
        address: basicTxInParameter.address,
      });
    });

    it("should handle optional fields with null", () => {
      const minimalTxInParameter = {
        txHash: "1234567890abcdef",
        txIndex: 0,
      };

      const result = txInParameterToObj(minimalTxInParameter);

      expect(result).toEqual({
        txHash: minimalTxInParameter.txHash,
        txIndex: minimalTxInParameter.txIndex,
        amount: null,
        address: null,
      });
    });
  });

  describe("scriptTxInParameterToObj", () => {
    const plutusScript: ScriptSource = {
      type: "Inline",
      txHash: "abc123",
      txIndex: 1,
      scriptHash: "def456",
      version: "V1",
      scriptSize: "100",
    };

    it("should handle script input with provided datum", () => {
      const scriptTxInParameter: ScriptTxInParameter = {
        scriptSource: plutusScript,
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
      };

      const result = scriptTxInParameterToObj(scriptTxInParameter);

      expect(result).toHaveProperty("scriptSource");
      expect(result).toHaveProperty("datumSource.providedDatumSource");
      expect(result).toHaveProperty("redeemer");
    });

    it("should handle script input with inline datum", () => {
      const scriptTxInParameter: ScriptTxInParameter = {
        scriptSource: plutusScript,
        datumSource: {
          type: "Inline",
          txHash: "ghi789",
          txIndex: 2,
        },
      };

      const result = scriptTxInParameterToObj(scriptTxInParameter);

      expect(result).toHaveProperty("scriptSource");
      expect(result).toHaveProperty("datumSource.inlineDatumSource");
      expect(result).toHaveProperty("redeemer", null);
    });

    it("should handle script input without datum and redeemer", () => {
      const scriptTxInParameter: ScriptTxInParameter = {
        scriptSource: plutusScript,
      };

      const result = scriptTxInParameterToObj(scriptTxInParameter);

      expect(result).toEqual({
        scriptSource: expect.any(Object),
        datumSource: null,
        redeemer: null,
      });
    });
  });

  describe("simpleScriptTxInParameterToObj", () => {
    it("should handle inline simple script source", () => {
      const simpleScriptTxInParameter = {
        scriptSource: {
          type: "Inline" as const,
          txHash: "abc123",
          txIndex: 1,
          simpleScriptHash: "def456",
          scriptSize: "100",
        },
      };

      const result = simpleScriptTxInParameterToObj(simpleScriptTxInParameter);

      expect(result).toHaveProperty("inlineSimpleScriptSource");
      expect(result).toMatchObject({
        inlineSimpleScriptSource: {
          refTxIn: {
            txHash: simpleScriptTxInParameter.scriptSource.txHash,
            txIndex: simpleScriptTxInParameter.scriptSource.txIndex,
          },
          simpleScriptHash:
            simpleScriptTxInParameter.scriptSource.simpleScriptHash,
          scriptSize: BigInt(simpleScriptTxInParameter.scriptSource.scriptSize),
        },
      });
    });

    it("should handle provided simple script source", () => {
      const simpleScriptTxInParameter = {
        scriptSource: {
          type: "Provided" as const,
          scriptCode:
            "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
        },
      };

      const result = simpleScriptTxInParameterToObj(simpleScriptTxInParameter);

      expect(result).toHaveProperty("providedSimpleScriptSource");
      expect(result).toMatchObject({
        providedSimpleScriptSource: {
          scriptCbor: simpleScriptTxInParameter.scriptSource.scriptCode,
        },
      });
    });
  });

  describe("txInToObj", () => {
    it("should handle PubKey transaction input", () => {
      const txIn: TxIn = {
        type: "PubKey",
        txIn: basicTxInParameter,
      };

      const result = txInToObj(txIn);

      expect(result).toEqual({
        pubKeyTxIn: {
          txIn: txInParameterToObj(basicTxInParameter),
        },
      });
    });

    it("should handle Script transaction input", () => {
      const txIn: TxIn = {
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
        },
      };

      const result = txInToObj(txIn);

      expect(result).toHaveProperty("scriptTxIn.txIn");
      expect(result).toHaveProperty("scriptTxIn.scriptTxIn.scriptSource");
    });

    it("should handle SimpleScript transaction input", () => {
      const txIn: TxIn = {
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

      const result = txInToObj(txIn);

      expect(result).toHaveProperty("simpleScriptTxIn.txIn");
      expect(result).toHaveProperty(
        "simpleScriptTxIn.simpleScriptTxIn.providedSimpleScriptSource",
      );
    });
  });

  describe("collateralTxInToObj", () => {
    it("should convert collateral transaction input", () => {
      const txIn: TxIn = {
        type: "PubKey",
        txIn: basicTxInParameter,
      };

      const result = collateralTxInToObj(txIn);

      expect(result).toEqual({
        txIn: txInParameterToObj(basicTxInParameter),
      });
    });
  });
});
