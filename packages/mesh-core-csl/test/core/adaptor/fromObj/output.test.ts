import { mConStr0, Output, PlutusScript } from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import { outputFromObj, outputToObj } from "@meshsdk/core-csl";

describe("output.ts Round Trip Tests", () => {
  describe("Basic Output", () => {
    it("should maintain output data in round trip without datum or script", () => {
      const originalOutput: Output = {
        address: "addr_test1234",
        amount: [{ unit: "lovelace", quantity: "1000000" }],
      };

      const serialized = outputToObj(originalOutput);
      const deserialized = outputFromObj(serialized);

      expect(deserialized).toEqual(originalOutput);
    });
  });

  describe("Output with Datum", () => {
    it("should maintain inline datum in round trip", () => {
      const originalOutput: Output = {
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

      const serialized = outputToObj(originalOutput);
      const deserialized = outputFromObj(serialized);

      expect(deserialized).toMatchObject(originalOutput);
    });

    it("should maintain hash datum in round trip", () => {
      const originalOutput: Output = {
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

      const serialized = outputToObj(originalOutput);
      const deserialized = outputFromObj(serialized);

      expect(deserialized).toMatchObject(originalOutput);
    });

    it("should maintain embedded datum in round trip", () => {
      const originalOutput: Output = {
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

      const serialized = outputToObj(originalOutput);
      const deserialized = outputFromObj(serialized);

      expect(deserialized).toMatchObject(originalOutput);
    });
  });

  describe("Output with Reference Script", () => {
    it("should maintain reference script data in round trip", () => {
      const originalOutput: Output = {
        address: "addr_test1234",
        amount: [{ unit: "lovelace", quantity: "1000000" }],
        referenceScript: {
          code: "8201828200581c1d227aefa4b773149170885aadba30aab3127cc611ddbc4999def61c",
          version: "V1",
        } as PlutusScript,
      };

      const serialized = outputToObj(originalOutput);
      const deserialized = outputFromObj(serialized);

      expect(deserialized).toMatchObject(originalOutput);
    });
  });

  describe("Complex Output", () => {
    it("should maintain all data in round trip with datum and reference script", () => {
      const originalOutput: Output = {
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

      const serialized = outputToObj(originalOutput);
      const deserialized = outputFromObj(serialized);

      expect(deserialized).toMatchObject(originalOutput);
    });
  });
});
