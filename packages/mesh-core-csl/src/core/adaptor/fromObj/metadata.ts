import JSONbig from "json-bigint";

import { Metadata, Metadatum, TxMetadata } from "@meshsdk/common";

// Configure JSONbig to properly handle BigInts while preserving regular strings
const JSONBigParser = JSONbig({
  storeAsString: false,
  useNativeBigInt: true,
  alwaysParseAsBig: false,
});

export const metadataFromObj = (metadataArray: Metadata[]): TxMetadata => {
  const result: TxMetadata = new Map<bigint, Metadatum>();

  metadataArray.forEach((metadata) => {
    const key = BigInt(metadata.tag);
    const value = objToMetadatum(JSONBigParser.parse(metadata.metadata));
    result.set(key, value);
  });

  return result;
};

const objToMetadatum = (obj: any): Metadatum => {
  if (typeof obj === "number") {
    return obj;
  } else if (typeof obj === "string") {
    // Check if it's a BigInt string (valid digits only), then convert to BigInt
    if (/^\d+$/.test(obj)) {
      return BigInt(obj);
    }
    // Check if its a negative BigInt string
    if (/^-?\d+$/.test(obj)) {
      return BigInt(obj);
    }
    return obj;
  } else if (typeof obj === "bigint") {
    return obj;
  } else if (typeof obj === "object" && obj !== null) {
    if (Array.isArray(obj)) {
      return obj.map(objToMetadatum);
    } else {
      // Convert object to Map
      const result = new Map<Metadatum, Metadatum>();
      Object.entries(obj).forEach(([key, value]) => {
        // Convert key back to original type
        let convertedKey: Metadatum = objToMetadatum(key);
        result.set(convertedKey, objToMetadatum(value));
      });
      return result;
    }
  } else {
    throw new Error("objToMetadatum: Unsupported object type");
  }
};
