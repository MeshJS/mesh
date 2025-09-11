import JSONbig from "json-bigint";

import type { Metadata, Metadatum, TxMetadata } from "@meshsdk/common";

export const txMetadataToObj = (metadata: TxMetadata): Metadata[] => {
  const result: Metadata[] = [];
  metadata.forEach((value: Metadatum, key: bigint) => {
    result.push({
      tag: key.toString(),
      metadata: JSONbig.stringify(metadatumToObj(value)),
    });
  });
  return result;
};

const metadatumToObj = (metadatum: Metadatum): any => {
  if (typeof metadatum === "number" || typeof metadatum === "string") {
    return metadatum;
  } else if (typeof metadatum === "bigint") {
    return metadatum.toString();
  } else if (metadatum instanceof Uint8Array) {
    return uint8ArrayToHex(metadatum);
  } else if (metadatum instanceof Map) {
    const result: Record<string | number, any> = {};
    metadatum.forEach((value, key) => {
      result[metadatumToObj(key)] = metadatumToObj(value);
    });
    return result;
  } else if (Array.isArray(metadatum)) {
    return metadatum.map(metadatumToObj);
  } else {
    throw new Error("metadatumToObj: Unsupported Metadatum type");
  }
};

const uint8ArrayToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
