import {
  MintItem,
  ScriptSource,
  SimpleScriptSourceInfo,
} from "@meshsdk/common";
import {
  mintItemFromObj,
  mintItemToObj,
  mintParametersFromObj,
  mintParametersObj,
  nativeMintItemFromObj,
  plutusMintItemFromObj,
} from "@meshsdk/core-csl";

describe("mint.ts", () => {
  describe("mintParametersFromObj", () => {
    it("should convert mint parameters object back to MintItem parameters", () => {
      const obj = {
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: BigInt(100),
      };

      const result = mintParametersFromObj(obj);
      expect(result).toEqual({
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: "100",
      });
    });
  });

  describe("plutusMintItemFromObj", () => {
    it("should convert Plutus mint item object back to MintItem", () => {
      const obj = {
        mint: {
          policyId: "testPolicyId",
          assetName: "testAssetName",
          amount: BigInt(100),
        },
        scriptSource: {
          inlineScriptSource: {
            refTxIn: {
              txHash: "testTxHash",
              txIndex: 0,
            },
            scriptHash: "testScriptHash",
            languageVersion: "v1",
            scriptSize: BigInt(100),
          },
        },
        redeemer: {
          data: "testRedeemer",
          exUnits: {
            mem: 1000,
            steps: 1000,
          },
        },
      };

      const result = plutusMintItemFromObj(obj);
      expect(result).toMatchObject({
        type: "Plutus",
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: "100",
        scriptSource: {
          type: "Inline",
          txHash: "testTxHash",
          txIndex: 0,
          scriptHash: "testScriptHash",
          version: "V1",
          scriptSize: "100",
        },
      });
      expect(result).toHaveProperty("redeemer");
    });

    it("should handle null redeemer", () => {
      const obj = {
        mint: {
          policyId: "testPolicyId",
          assetName: "testAssetName",
          amount: BigInt(100),
        },
        scriptSource: {
          inlineScriptSource: {
            refTxIn: {
              txHash: "testTxHash",
              txIndex: 0,
            },
            scriptHash: "testScriptHash",
            languageVersion: "v1",
            scriptSize: BigInt(100),
          },
        },
        redeemer: null,
      };

      const result = plutusMintItemFromObj(obj);
      expect(result.redeemer).toBeUndefined();
    });
  });

  describe("nativeMintItemFromObj", () => {
    it("should convert Native mint item object back to MintItem", () => {
      const obj = {
        mint: {
          policyId: "testPolicyId",
          assetName: "testAssetName",
          amount: BigInt(100),
        },
        scriptSource: {
          providedSimpleScriptSource: {
            scriptCbor:
              "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
          },
        },
      };

      const result = nativeMintItemFromObj(obj);
      expect(result).toMatchObject({
        type: "Native",
        policyId: "testPolicyId",
        assetName: "testAssetName",
        amount: "100",
        scriptSource: {
          type: "Provided",
          scriptCode:
            "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
        },
      });
    });
  });

  describe("mintItemFromObj", () => {
    it("should handle Plutus mint items", () => {
      const obj = {
        scriptMint: {
          mint: {
            policyId: "testPolicyId",
            assetName: "testAssetName",
            amount: BigInt(100),
          },
          scriptSource: {
            inlineScriptSource: {
              refTxIn: {
                txHash: "testTxHash",
                txIndex: 0,
              },
              scriptHash: "testScriptHash",
              languageVersion: "v1",
              scriptSize: BigInt(100),
            },
          },
          redeemer: {
            data: "testRedeemer",
            exUnits: {
              mem: 1000,
              steps: 1000,
            },
          },
        },
      };

      const result = mintItemFromObj(obj);
      expect(result.type).toBe("Plutus");
      expect(result).toHaveProperty("scriptSource");
      expect(result).toHaveProperty("redeemer");
    });

    it("should handle Native mint items", () => {
      const obj = {
        simpleScriptMint: {
          mint: {
            policyId: "testPolicyId",
            assetName: "testAssetName",
            amount: BigInt(100),
          },
          scriptSource: {
            providedSimpleScriptSource: {
              scriptCbor:
                "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
            },
          },
        },
      };

      const result = mintItemFromObj(obj);
      expect(result.type).toBe("Native");
      expect(result).toHaveProperty("scriptSource");
      expect(result.redeemer).toBeUndefined();
    });

    it("should throw error for unknown mint item format", () => {
      const obj = {
        unknownType: {},
      };

      expect(() => mintItemFromObj(obj)).toThrow("Unknown mint item format");
    });
  });

  describe("Round Trip Tests", () => {
    describe("Plutus Mint Item Round Trip", () => {
      it("should maintain data integrity when converting to obj and back", () => {
        const originalMintItem: Required<MintItem> = {
          type: "Plutus",
          policyId: "testPolicyId",
          assetName: "testAssetName",
          amount: "100",
          scriptSource: {
            type: "Inline",
            txHash: "testTxHash",
            txIndex: 0,
            scriptHash: "testScriptHash",
            version: "V1",
            scriptSize: "100",
          } as ScriptSource,
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

        // Convert to obj and back
        const serialized = mintItemToObj(originalMintItem);
        const deserialized = mintItemFromObj(serialized);

        // Verify structure and values are maintained
        expect(deserialized.type).toBe(originalMintItem.type);
        expect(deserialized.policyId).toBe(originalMintItem.policyId);
        expect(deserialized.assetName).toBe(originalMintItem.assetName);
        expect(deserialized.amount).toBe(originalMintItem.amount);
        expect(deserialized.scriptSource).toMatchObject(
          originalMintItem.scriptSource,
        );
        expect(deserialized.redeemer).toBeDefined();
        expect(deserialized.redeemer?.exUnits).toEqual(
          originalMintItem.redeemer.exUnits,
        );
      });

      it("should handle null redeemer in round trip", () => {
        const originalMintItem: MintItem = {
          type: "Plutus",
          policyId: "testPolicyId",
          assetName: "testAssetName",
          amount: "100",
          scriptSource: {
            type: "Inline",
            txHash: "testTxHash",
            txIndex: 0,
            scriptHash: "testScriptHash",
            version: "V1",
            scriptSize: "100",
          } as ScriptSource,
        };

        const serialized = mintItemToObj(originalMintItem);
        const deserialized = mintItemFromObj(serialized);

        expect(deserialized).toMatchObject(originalMintItem);
        expect(deserialized.redeemer).toBeUndefined();
      });
    });

    describe("Native Mint Item Round Trip", () => {
      it("should maintain data integrity when converting to obj and back", () => {
        const originalMintItem: MintItem = {
          type: "Native",
          policyId: "testPolicyId",
          assetName: "testAssetName",
          amount: "100",
          scriptSource: {
            type: "Provided",
            scriptCode:
              "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
          } as SimpleScriptSourceInfo,
        };

        const serialized = mintItemToObj(originalMintItem);
        const deserialized = mintItemFromObj(serialized);

        expect(deserialized).toMatchObject(originalMintItem);
      });
    });

    describe("Mint Parameters Round Trip", () => {
      it("should maintain data integrity when converting to obj and back", () => {
        const originalMintItem: MintItem = {
          type: "Plutus",
          policyId: "testPolicyId",
          assetName: "testAssetName",
          amount: "100",
        };

        const serialized = mintParametersObj(originalMintItem);
        const deserialized = mintParametersFromObj(serialized);

        expect(deserialized).toMatchObject({
          policyId: originalMintItem.policyId,
          assetName: originalMintItem.assetName,
          amount: originalMintItem.amount,
        });
      });
    });
  });
});
