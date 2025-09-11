import JSONbig from "json-bigint";

import { Metadatum } from "@meshsdk/common";
import { txMetadataToObj } from "@meshsdk/core-csl";

describe("Metadata Adaptor - toObj", () => {
  describe("txMetadataToObj", () => {
    test("should convert empty TxMetadata to empty array", () => {
      const txMetadata = new Map<bigint, Metadatum>();
      const result = txMetadataToObj(txMetadata);
      expect(result).toEqual([]);
    });

    test("should convert TxMetadata with simple values", () => {
      const txMetadata = new Map<bigint, Metadatum>();
      txMetadata.set(BigInt(674), "Hello World");
      txMetadata.set(BigInt(42), 12345);
      txMetadata.set(BigInt(9999), BigInt("9007199254740991"));

      const result = txMetadataToObj(txMetadata);

      expect(result).toHaveLength(3);
      expect(result).toContainEqual({
        tag: "674",
        metadata: JSONbig.stringify("Hello World"),
      });
      expect(result).toContainEqual({
        tag: "42",
        metadata: JSONbig.stringify(12345),
      });
      expect(result).toContainEqual({
        tag: "9999",
        metadata: JSONbig.stringify("9007199254740991"),
      });
    });

    test("should convert TxMetadata with binary data", () => {
      const txMetadata = new Map<bigint, Metadatum>();
      const binaryData = new Uint8Array([222, 173, 190, 239]); // 0xdeadbeef
      txMetadata.set(BigInt(1), binaryData);

      const result = txMetadataToObj(txMetadata);

      expect(result).toHaveLength(1);
      expect(result[0]!.tag).toBe("1");
      expect(JSON.parse(result[0]!.metadata)).toBe("deadbeef");
    });

    test("should convert TxMetadata with arrays", () => {
      const txMetadata = new Map<bigint, Metadatum>();
      const arrayData: Metadatum[] = [1, "two", BigInt(3)];
      txMetadata.set(BigInt(100), arrayData);

      const result = txMetadataToObj(txMetadata);

      expect(result).toHaveLength(1);
      expect(result[0]!.tag).toBe("100");
      expect(JSON.parse(result[0]!.metadata)).toEqual([1, "two", "3"]);
    });

    test("should convert TxMetadata with maps", () => {
      const txMetadata = new Map<bigint, Metadatum>();
      const mapData = new Map<Metadatum, Metadatum>();
      mapData.set("name", "Alice");
      mapData.set("age", 30);
      mapData.set("balance", BigInt("123456789012345"));

      txMetadata.set(BigInt(200), mapData);

      const result = txMetadataToObj(txMetadata);

      expect(result).toHaveLength(1);
      expect(result[0]!.tag).toBe("200");

      const parsedMetadata = JSON.parse(result[0]!.metadata);
      expect(parsedMetadata).toEqual({
        name: "Alice",
        age: 30,
        balance: "123456789012345",
      });
    });

    test("should convert TxMetadata with nested structures", () => {
      const txMetadata = new Map<bigint, Metadatum>();

      const innerMap = new Map<Metadatum, Metadatum>();
      innerMap.set("type", "NFT");
      innerMap.set("id", BigInt(123));

      const arrayWithMap: Metadatum[] = ["token", 42, innerMap];

      const outerMap = new Map<Metadatum, Metadatum>();
      outerMap.set("collection", "CryptoArt");
      outerMap.set("items", arrayWithMap);
      outerMap.set("binary", new Uint8Array([1, 2, 3, 4]));

      txMetadata.set(BigInt(721), outerMap);

      const result = txMetadataToObj(txMetadata);

      expect(result).toHaveLength(1);
      expect(result[0]!.tag).toBe("721");

      const parsedMetadata = JSON.parse(result[0]!.metadata);
      expect(parsedMetadata).toEqual({
        collection: "CryptoArt",
        items: [
          "token",
          42,
          {
            type: "NFT",
            id: "123",
          },
        ],
        binary: "01020304",
      });
    });

    test("should handle complex map keys", () => {
      const txMetadata = new Map<bigint, Metadatum>();
      const mapWithComplexKeys = new Map<Metadatum, Metadatum>();

      // Using numbers, strings, and BigInts as keys
      mapWithComplexKeys.set(42, "number key");
      mapWithComplexKeys.set("string", "string key");
      mapWithComplexKeys.set(BigInt(999), "bigint key");

      txMetadata.set(BigInt(999), mapWithComplexKeys);

      const result = txMetadataToObj(txMetadata);

      expect(result).toHaveLength(1);
      const parsedMetadata = JSON.parse(result[0]!.metadata);

      expect(parsedMetadata).toEqual({
        "42": "number key",
        string: "string key",
        "999": "bigint key",
      });
    });

    test("should throw error for unsupported metadatum type", () => {
      const txMetadata = new Map<bigint, Metadatum>();

      // Using an unsupported type (object that is not a Map or Array)
      const unsupportedType = { notSupported: true } as unknown as Metadatum;
      txMetadata.set(BigInt(404), unsupportedType);

      expect(() => txMetadataToObj(txMetadata)).toThrow(
        "metadatumToObj: Unsupported Metadatum type",
      );
    });
  });
});
