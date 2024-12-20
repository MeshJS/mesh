import {
  BuilderData,
  DeserializedAddress,
  MeshTxBuilderBody,
  Protocol,
} from "@meshsdk/common";

import { CSLSerializer } from "../../src/core/serializer";

describe("CSLSerializer", () => {
  let serializer: CSLSerializer;

  beforeEach(() => {
    serializer = new CSLSerializer();
  });

  describe("resolver", () => {
    describe("keys", () => {
      it("should resolve private key correctly", () => {
        const words = [
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
          "summer",
        ];
        const result = serializer.resolver.keys.resolvePrivateKey(words);
        console.log(result);
        // expect(result).toBeDefined();
        // Add more assertions based on expected output
      });
    });
  });
});
