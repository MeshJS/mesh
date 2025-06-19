import { mConStr0, Output, PlutusScript } from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import { outputToObj } from "@meshsdk/core-csl";

describe("output.ts", () => {
  describe("Basic Output", () => {
    it("should convert basic output without datum or script", () => {
      const output: Output = {
        address: "addr_test1234",
        amount: [{ unit: "lovelace", quantity: "1000000" }],
      };

      const result = outputToObj(output);

      expect(result).toEqual({
        address: output.address,
        amount: output.amount,
        datum: null,
        referenceScript: null,
      });
    });

    it("should handle multiple tokens in amount", () => {
      const output: Output = {
        address: "addr_test1234",
        amount: [
          { unit: "lovelace", quantity: "1000000" },
          { unit: "token1", quantity: "5000" },
        ],
      };

      const result = outputToObj(output);

      expect(result).toEqual({
        address: output.address,
        amount: output.amount,
        datum: null,
        referenceScript: null,
      });
    });
  });

  describe("Output with Datum", () => {
    it("should handle inline datum", () => {
      const output: Output = {
        address: "addr_test1234",
        amount: [{ unit: "lovelace", quantity: "1000000" }],
        datum: {
          type: "Inline",
          data: {
            type: "CBOR",
            content: serializeData(mConStr0([])),
          },
        },
      };

      const result = outputToObj(output);

      expect(result).toHaveProperty("datum.inline");
      expect(result).toMatchObject({
        address: output.address,
        amount: output.amount,
      });
    });

    it("should handle hash datum", () => {
      const output: Output = {
        address: "addr_test1234",
        amount: [{ unit: "lovelace", quantity: "1000000" }],
        datum: {
          type: "Hash",
          data: {
            type: "CBOR",
            content: serializeData(mConStr0([])),
          },
        },
      };

      const result = outputToObj(output);

      expect(result).toHaveProperty("datum.hash");
      expect(result).toMatchObject({
        address: output.address,
        amount: output.amount,
      });
    });

    it("should handle embedded datum", () => {
      const output: Output = {
        address: "addr_test1234",
        amount: [{ unit: "lovelace", quantity: "1000000" }],
        datum: {
          type: "Embedded",
          data: {
            type: "CBOR",
            content: serializeData(mConStr0([])),
          },
        },
      };

      const result = outputToObj(output);

      expect(result).toHaveProperty("datum.embedded");
      expect(result).toMatchObject({
        address: output.address,
        amount: output.amount,
      });
    });
  });

  describe("Output with Reference Script", () => {
    it("should handle Plutus reference script", () => {
      const output: Output = {
        address: "addr_test1234",
        amount: [{ unit: "lovelace", quantity: "1000000" }],
        referenceScript: {
          code: "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
          version: "V1",
        } as PlutusScript,
      };

      const result = outputToObj(output);

      expect(result).toMatchObject({
        address: output.address,
        amount: output.amount,
        referenceScript: {
          providedScriptSource: {
            scriptCbor: output.referenceScript!.code,
            languageVersion: "v1",
          },
        },
      });
    });

    it("should handle null reference script", () => {
      const output: Output = {
        address: "addr_test1234",
        amount: [{ unit: "lovelace", quantity: "1000000" }],
      };

      const result = outputToObj(output);

      expect(result).toMatchObject({
        address: output.address,
        amount: output.amount,
        referenceScript: null,
      });
    });
  });

  describe("Complex Output", () => {
    it("should handle output with datum and reference script", () => {
      const output: Output = {
        address: "addr_test1234",
        amount: [
          { unit: "lovelace", quantity: "1000000" },
          { unit: "token1", quantity: "5000" },
        ],
        datum: {
          type: "Inline",
          data: {
            type: "CBOR",
            content: serializeData(mConStr0([])),
          },
        },
        referenceScript: {
          code: "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
          version: "V1",
        } as PlutusScript,
      };

      const result = outputToObj(output);

      expect(result).toHaveProperty("datum.inline");
      expect(result).toHaveProperty("referenceScript.providedScriptSource");
      expect(result).toMatchObject({
        address: output.address,
        amount: output.amount,
      });
    });
  });
});
