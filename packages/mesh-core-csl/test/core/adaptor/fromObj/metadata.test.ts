import { Metadatum } from "@meshsdk/common";
import { metadataFromObj, txMetadataToObj } from "@meshsdk/core-csl";

describe("Metadata Round Trip Tests", () => {
  describe("metadataFromObj round trip conversion", () => {
    test("should round trip simple primitive values", () => {
      const originalTxMetadata = new Map<bigint, Metadatum>();
      originalTxMetadata.set(BigInt(1), "simple string");
      originalTxMetadata.set(BigInt(2), 42);
      originalTxMetadata.set(BigInt(3), 9007199254740991n);

      const objRepresentation = txMetadataToObj(originalTxMetadata);
      const reconstructed = metadataFromObj(objRepresentation);

      expect(reconstructed).toEqual(originalTxMetadata);
    });

    test("should round trip arrays with mixed types", () => {
      const originalTxMetadata = new Map<bigint, Metadatum>();
      originalTxMetadata.set(BigInt(1), ["string", 123, BigInt("456")]);
      originalTxMetadata.set(BigInt(2), ["test", 789]);

      const objRepresentation = txMetadataToObj(originalTxMetadata);
      const reconstructed = metadataFromObj(objRepresentation);

      expect(reconstructed).toEqual(originalTxMetadata);
    });

    test("should round trip nested maps", () => {
      const originalTxMetadata = new Map<bigint, Metadatum>();

      const nestedMap = new Map<Metadatum, Metadatum>();
      nestedMap.set("name", "Alice");
      nestedMap.set("age", 30);
      nestedMap.set("balance", BigInt("123456789012345"));

      originalTxMetadata.set(BigInt(721), nestedMap);

      const objRepresentation = txMetadataToObj(originalTxMetadata);
      const reconstructed = metadataFromObj(objRepresentation);

      expect(reconstructed).toEqual(originalTxMetadata);
    });

    test("should round trip complex nested structures", () => {
      const originalTxMetadata = new Map<bigint, Metadatum>();

      const complexData = new Map<Metadatum, Metadatum>();
      complexData.set("collection", "CryptoArt");

      const itemsArray = [
        "token",
        42,
        new Map([
          ["type", "NFT"],
          ["id", BigInt("123")],
          ["attributes", ["rare", "animated"]],
        ] as [Metadatum, Metadatum][]),
      ];

      complexData.set("items", itemsArray);
      complexData.set("numbers", [BigInt("999"), 777, 555n]);

      originalTxMetadata.set(BigInt(721), complexData);
      originalTxMetadata.set(BigInt(674), "simple value");

      const objRepresentation = txMetadataToObj(originalTxMetadata);
      const reconstructed = metadataFromObj(objRepresentation);

      expect(reconstructed).toEqual(originalTxMetadata);
    });

    test("should round trip CIP-25 NFT metadata structure", () => {
      const originalTxMetadata = new Map<bigint, Metadatum>();

      const nftMetadata = new Map<Metadatum, Metadatum>();
      const policyMap = new Map<Metadatum, Metadatum>();
      const tokenMap = new Map<Metadatum, Metadatum>();

      tokenMap.set("name", "My Cool NFT");
      tokenMap.set("description", "A very cool NFT");
      tokenMap.set("image", "ipfs://QmHash123");
      tokenMap.set("attributes", [
        new Map([
          ["trait_type", "Background"],
          ["value", "Blue"],
        ] as [Metadatum, Metadatum][]),
        new Map([
          ["trait_type", "Rarity"],
          ["value", "Legendary"],
        ] as [Metadatum, Metadatum][]),
      ]);

      policyMap.set("MyToken001", tokenMap);
      nftMetadata.set(
        "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc",
        policyMap,
      );

      originalTxMetadata.set(BigInt(721), nftMetadata);

      const objRepresentation = txMetadataToObj(originalTxMetadata);
      const reconstructed = metadataFromObj(objRepresentation);

      expect(reconstructed).toEqual(originalTxMetadata);
    });

    test("should round trip maps with mixed key types", () => {
      const originalTxMetadata = new Map<bigint, Metadatum>();

      const mixedMap = new Map<Metadatum, Metadatum>();
      mixedMap.set("string_key", "value1");
      mixedMap.set(42n, "value2");
      mixedMap.set(BigInt("999"), "value3");

      originalTxMetadata.set(BigInt(123), mixedMap);

      const objRepresentation = txMetadataToObj(originalTxMetadata);
      const reconstructed = metadataFromObj(objRepresentation);

      expect(reconstructed).toEqual(originalTxMetadata);
    });

    test("should round trip large bigint values", () => {
      const originalTxMetadata = new Map<bigint, Metadatum>();

      originalTxMetadata.set(BigInt(1), BigInt("0"));
      originalTxMetadata.set(BigInt(2), BigInt("9007199254740991")); // Max safe integer
      originalTxMetadata.set(BigInt(3), BigInt("18446744073709551615")); // Max uint64
      originalTxMetadata.set(BigInt(4), BigInt("-9007199254740991")); // Negative

      const objRepresentation = txMetadataToObj(originalTxMetadata);
      const reconstructed = metadataFromObj(objRepresentation);

      expect(reconstructed).toEqual(originalTxMetadata);
    });

    test("should round trip deeply nested structures", () => {
      const originalTxMetadata = new Map<bigint, Metadatum>();

      const level3 = new Map<Metadatum, Metadatum>();
      level3.set("deep", "value");
      level3.set("array", [1, 2, 3]);

      const level2 = new Map<Metadatum, Metadatum>();
      level2.set("nested", level3);

      const level1 = new Map<Metadatum, Metadatum>();
      level1.set("level2", level2);
      level1.set("bigint", BigInt("18446744073709551615"));

      originalTxMetadata.set(BigInt(999), level1);

      const objRepresentation = txMetadataToObj(originalTxMetadata);
      const reconstructed = metadataFromObj(objRepresentation);

      expect(reconstructed).toEqual(originalTxMetadata);
    });

    test("should round trip empty metadata", () => {
      const originalTxMetadata = new Map<bigint, Metadatum>();

      const objRepresentation = txMetadataToObj(originalTxMetadata);
      const reconstructed = metadataFromObj(objRepresentation);

      expect(reconstructed).toEqual(originalTxMetadata);
    });

    test("should preserve data types after round trip", () => {
      const originalTxMetadata = new Map<bigint, Metadatum>();

      originalTxMetadata.set(BigInt(1), "string_value");
      originalTxMetadata.set(BigInt(2), 12345);
      originalTxMetadata.set(BigInt(3), BigInt("9007199254740991"));
      originalTxMetadata.set(BigInt(4), [1, "two", BigInt(3)]);

      const nestedMap = new Map<Metadatum, Metadatum>();
      nestedMap.set("key1", "value1");
      nestedMap.set(42n, BigInt("789"));
      originalTxMetadata.set(BigInt(5), nestedMap);

      const objRepresentation = txMetadataToObj(originalTxMetadata);
      const reconstructed = metadataFromObj(objRepresentation);

      // Verify structure equality
      expect(reconstructed).toEqual(originalTxMetadata);

      // Verify specific type preservation
      expect(typeof reconstructed.get(BigInt(1))).toBe("string");
      expect(typeof reconstructed.get(BigInt(2))).toBe("number");
      expect(typeof reconstructed.get(BigInt(3))).toBe("bigint");
      expect(Array.isArray(reconstructed.get(BigInt(4)))).toBe(true);
      expect(reconstructed.get(BigInt(5))).toBeInstanceOf(Map);
    });
  });
});
