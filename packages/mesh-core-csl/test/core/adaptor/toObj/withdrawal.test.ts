import { mConStr0, Withdrawal } from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";

import { withdrawalToObj } from "../../../../src/core/adaptor/toObj/withdrawal";

describe("withdrawalToObj", () => {
  describe("PubKeyWithdrawal", () => {
    it("should convert PubKeyWithdrawal correctly", () => {
      const withdrawal: Withdrawal = {
        type: "PubKeyWithdrawal",
        address:
          "stake_test1uqrw9tjymlm8wrwq7jk68n6v7fs9qz8z0tkdkve26dylmfc2ux2hj",
        coin: "1000000",
      };

      const result = withdrawalToObj(withdrawal);
      expect(result).toEqual({
        pubKeyWithdrawal: {
          address:
            "stake_test1uqrw9tjymlm8wrwq7jk68n6v7fs9qz8z0tkdkve26dylmfc2ux2hj",
          coin: BigInt(1000000),
        },
      });
    });
  });

  describe("ScriptWithdrawal", () => {
    it("should convert ScriptWithdrawal correctly with script source and redeemer", () => {
      const withdrawal: Withdrawal = {
        type: "ScriptWithdrawal",
        address:
          "stake_test1uzx0kzy5pz6c5frjf8hnp4rh7y5hy4hpp5c86c8y3zpqqss6z0r89",
        coin: "2000000",
        scriptSource: {
          type: "Inline",
          txHash: "abcdef1234567890",
          txIndex: 0,
          scriptHash: "def123",
          scriptSize: "100",
          version: "V2",
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

      const result = withdrawalToObj(withdrawal);
      expect(result).toEqual({
        plutusScriptWithdrawal: {
          address:
            "stake_test1uzx0kzy5pz6c5frjf8hnp4rh7y5hy4hpp5c86c8y3zpqqss6z0r89",
          coin: BigInt(2000000),
          scriptSource: {
            inlineScriptSource: {
              refTxIn: {
                txHash: "abcdef1234567890",
                txIndex: 0,
              },
              scriptHash: "def123",
              scriptSize: 100n,
              languageVersion: "v2",
            },
          },
          redeemer: {
            data: serializeData(mConStr0([])),
            exUnits: {
              mem: 1000000,
              steps: 500000000,
            },
          },
        },
      });
    });

    it("should throw error when scriptSource is missing", () => {
      const withdrawal: Withdrawal = {
        type: "ScriptWithdrawal",
        address:
          "stake_test1uzx0kzy5pz6c5frjf8hnp4rh7y5hy4hpp5c86c8y3zpqqss6z0r89",
        coin: "2000000",
        redeemer: {
          data: {
            type: "CBOR",
            content: serializeData(mConStr0([])),
          },
          exUnits: { mem: 1000000, steps: 500000000 },
        },
      };

      expect(() => withdrawalToObj(withdrawal)).toThrow(
        "withdrawalToObj: missing scriptSource in plutusScriptWithdrawal.",
      );
    });

    it("should throw error when redeemer is missing", () => {
      const withdrawal: Withdrawal = {
        type: "ScriptWithdrawal",
        address:
          "stake_test1uzx0kzy5pz6c5frjf8hnp4rh7y5hy4hpp5c86c8y3zpqqss6z0r89",
        coin: "2000000",
        scriptSource: {
          type: "Inline",
          txHash: "abcdef1234567890",
          txIndex: 0,
          scriptHash: "def123",
          scriptSize: "100",
          version: "V2",
        },
      };

      expect(() => withdrawalToObj(withdrawal)).toThrow(
        "withdrawalToObj: missing redeemer in plutusScriptWithdrawal.",
      );
    });
  });

  describe("SimpleScriptWithdrawal", () => {
    it("should convert SimpleScriptWithdrawal correctly", () => {
      const withdrawal: Withdrawal = {
        type: "SimpleScriptWithdrawal",
        address:
          "stake_test1upf7e8202cs7ytd2gwmlcmkqy4hp8gp8x8tr7c7mxuj0g0s92j3h6",
        coin: "3000000",
        scriptSource: {
          type: "Inline",
          txHash: "abcdef1234567890",
          txIndex: 0,
          simpleScriptHash: "def123",
        },
      };

      const result = withdrawalToObj(withdrawal);
      expect(result).toEqual({
        simpleScriptWithdrawal: {
          address:
            "stake_test1upf7e8202cs7ytd2gwmlcmkqy4hp8gp8x8tr7c7mxuj0g0s92j3h6",
          coin: BigInt(3000000),
          scriptSource: {
            inlineSimpleScriptSource: {
              refTxIn: {
                txHash: "abcdef1234567890",
                txIndex: 0,
              },
              simpleScriptHash: "def123",
            },
          },
        },
      });
    });
  });
});
