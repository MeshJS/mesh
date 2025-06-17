import {
  MintItem,
  ScriptSource,
  SimpleScriptSourceInfo,
} from "@meshsdk/common";
import {
  mintItemToObj,
  mintParametersObj,
  nativeMintItemToObj,
  plutusMintItemToObj,
} from "@meshsdk/core-csl";

describe("mint.ts", () => {
  const mockPlutusScriptSource: ScriptSource = {
    type: "Inline",
    txHash: "testTxHash",
    txIndex: 0,
    scriptHash: "testScriptHash",
    scriptSize: "100",
    version: "V1",
  };

  const mockNativeScriptSource: SimpleScriptSourceInfo = {
    type: "Provided",
    scriptCode:
      "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
  };

  describe("mintParametersObj", () => {
    it("should convert mint parameters to object correctly", () => {
      const mintItem: MintItem = {
        type: "Plutus",
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: "100",
      };

      const result = mintParametersObj(mintItem);
      expect(result).toEqual({
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: BigInt(100),
      });
    });
  });

  describe("plutusMintItemToObj", () => {
    it("should convert Plutus mint item to object correctly", () => {
      const mintItem: Required<MintItem> = {
        type: "Plutus",
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: "100",
        scriptSource: mockPlutusScriptSource,
        redeemer: {
          data: {
            type: "Mesh",
            content: { alternative: 0, fields: [] },
          },
          exUnits: {
            mem: 1000,
            steps: 1000,
          },
        },
      };

      const result = plutusMintItemToObj(mintItem);
      expect(result).toMatchObject({
        mint: {
          policyId: "testPolicyId",
          assetName: "testAssetName",
          amount: BigInt(100),
        },
        scriptSource: {
          inlineScriptSource: expect.any(Object),
        },
      });
      expect(result).toHaveProperty("redeemer");
    });

    it("should handle null redeemer", () => {
      const mintItem: any = {
        type: "Plutus",
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: "100",
        scriptSource: mockPlutusScriptSource,
      };

      const result = plutusMintItemToObj(mintItem);
      expect(result).toMatchObject({
        mint: {
          policyId: "testPolicyId",
          assetName: "testAssetName",
          amount: BigInt(100),
        },
        redeemer: null,
      });
    });
  });

  describe("nativeMintItemToObj", () => {
    it("should convert Native mint item to object correctly", () => {
      const mintItem = {
        type: "Native" as const,
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: "100",
        scriptSource: mockNativeScriptSource,
      };

      const result = nativeMintItemToObj(mintItem);
      expect(result).toMatchObject({
        mint: {
          policyId: "testPolicyId",
          assetName: "testAssetName",
          amount: BigInt(100),
        },
        scriptSource: {
          providedSimpleScriptSource: {
            scriptCbor: expect.any(String),
          },
        },
      });
    });
  });

  describe("mintItemToObj", () => {
    it("should handle Plutus mint items", () => {
      const mintItem: MintItem = {
        type: "Plutus",
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: "100",
        scriptSource: mockPlutusScriptSource,
        redeemer: {
          data: {
            type: "Mesh",
            content: { alternative: 0, fields: [] },
          },
          exUnits: {
            mem: 1000,
            steps: 1000,
          },
        },
      };

      const result = mintItemToObj(mintItem);
      expect(result).toHaveProperty("scriptMint");
    });

    it("should handle Native mint items", () => {
      const mintItem: MintItem = {
        type: "Native",
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: "100",
        scriptSource: mockNativeScriptSource,
      };

      const result = mintItemToObj(mintItem);
      expect(result).toHaveProperty("simpleScriptMint");
    });
  });
});
