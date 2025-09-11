import {
  mConStr0,
  Redeemer,
  ScriptSource,
  SimpleScriptSourceInfo,
  Withdrawal,
} from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import { withdrawalFromObj, withdrawalToObj } from "@meshsdk/core-csl";

describe("withdrawal.ts", () => {
  const mockRedeemer: Redeemer = {
    data: {
      type: "CBOR",
      content: serializeData(mConStr0([])),
    },
    exUnits: {
      mem: 1000000,
      steps: 500000000,
    },
  };

  const mockPlutusScript: ScriptSource = {
    type: "Provided",
    script: {
      code: "aabbcc112233445566778899aabbccddeeff",
      version: "V1",
    },
  };

  const mockSimpleScript: SimpleScriptSourceInfo = {
    type: "Provided",
    scriptCode: "aabbcc112233445566778899aabbccddeeff",
  };

  describe("withdrawalFromObj", () => {
    it("should convert PubKeyWithdrawal correctly", () => {
      const withdrawalObj = {
        pubKeyWithdrawal: {
          address:
            "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
          coin: BigInt("1000000"),
        },
      };

      const result = withdrawalFromObj(withdrawalObj);

      expect(result).toEqual({
        type: "PubKeyWithdrawal",
        address:
          "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
        coin: "1000000",
      });
    });

    it("should convert ScriptWithdrawal correctly", () => {
      const withdrawalObj = {
        plutusScriptWithdrawal: {
          address:
            "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
          coin: BigInt("2000000"),
          scriptSource: {
            providedScriptSource: {
              scriptCbor: mockPlutusScript.script.code,
              languageVersion: mockPlutusScript.script.version.toLowerCase(),
            },
          },
          redeemer: {
            data: mockRedeemer.data.content,
            exUnits: mockRedeemer.exUnits,
          },
        },
      };

      const result = withdrawalFromObj(withdrawalObj);

      expect(result).toEqual({
        type: "ScriptWithdrawal",
        address:
          "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
        coin: "2000000",
        scriptSource: mockPlutusScript,
        redeemer: mockRedeemer,
      });
    });

    it("should convert SimpleScriptWithdrawal correctly", () => {
      const withdrawalObj = {
        simpleScriptWithdrawal: {
          address:
            "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
          coin: BigInt("3000000"),
          scriptSource: {
            providedSimpleScriptSource: {
              scriptCbor: mockSimpleScript.scriptCode,
            },
          },
        },
      };

      const result = withdrawalFromObj(withdrawalObj);

      expect(result).toEqual({
        type: "SimpleScriptWithdrawal",
        address:
          "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
        coin: "3000000",
        scriptSource: mockSimpleScript,
      });
    });

    it("should throw error for invalid withdrawal object structure", () => {
      const invalidWithdrawalObj = {
        invalidWithdrawalType: {},
      };

      expect(() => withdrawalFromObj(invalidWithdrawalObj)).toThrow(
        "withdrawalFromObj: Invalid withdrawal object format",
      );
    });
  });

  describe("Round-trip conversion", () => {
    it("should maintain data integrity for PubKeyWithdrawal in round-trip conversion", () => {
      const originalWithdrawal: Withdrawal = {
        type: "PubKeyWithdrawal",
        address:
          "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
        coin: "1000000",
      };

      const convertedObj = withdrawalToObj(originalWithdrawal);
      const roundTripWithdrawal = withdrawalFromObj(convertedObj);

      expect(roundTripWithdrawal).toEqual(originalWithdrawal);
    });

    it("should maintain data integrity for ScriptWithdrawal in round-trip conversion", () => {
      const originalWithdrawal: Withdrawal = {
        type: "ScriptWithdrawal",
        address:
          "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
        coin: "2000000",
        scriptSource: mockPlutusScript,
        redeemer: mockRedeemer,
      };

      const convertedObj = withdrawalToObj(originalWithdrawal);
      const roundTripWithdrawal = withdrawalFromObj(convertedObj);

      expect(roundTripWithdrawal).toEqual(originalWithdrawal);
    });

    it("should maintain data integrity for SimpleScriptWithdrawal in round-trip conversion", () => {
      const originalWithdrawal: Withdrawal = {
        type: "SimpleScriptWithdrawal",
        address:
          "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl",
        coin: "3000000",
        scriptSource: mockSimpleScript,
      };

      const convertedObj = withdrawalToObj(originalWithdrawal);
      const roundTripWithdrawal = withdrawalFromObj(convertedObj);

      expect(roundTripWithdrawal).toEqual(originalWithdrawal);
    });
  });
});
