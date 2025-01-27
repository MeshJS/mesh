import { Metadatum, TxMetadata } from "@meshsdk/common";

import { MetadatumList, MetadatumMap, TransactionMetadatum } from "../types";

export const toCardanoMetadataMap = (
  metadata: TxMetadata,
): Map<bigint, TransactionMetadatum> => {
  let cardanoMetadataMap = new Map<bigint, TransactionMetadatum>();
  metadata.forEach((val, key) => {
    cardanoMetadataMap.set(key, toCardanoMetadatum(val));
  });
  return cardanoMetadataMap;
};

export const toCardanoMetadatum = (
  metadatum: Metadatum,
): TransactionMetadatum => {
  if (typeof metadatum === "number") {
    return TransactionMetadatum.newInteger(BigInt(metadatum));
  } else if (typeof metadatum === "string") {
    return TransactionMetadatum.newText(metadatum);
  } else if (typeof metadatum === "bigint") {
    return TransactionMetadatum.newInteger(metadatum);
  } else if (metadatum instanceof Uint8Array) {
    return TransactionMetadatum.newBytes(metadatum);
  } else if (metadatum instanceof Map) {
    const result: MetadatumMap = new MetadatumMap();
    metadatum.forEach((value, key) => {
      result.insert(toCardanoMetadatum(key), toCardanoMetadatum(value));
    });
    return TransactionMetadatum.newMap(result);
  } else if (Array.isArray(metadatum)) {
    const result: MetadatumList = new MetadatumList();
    metadatum.forEach((val) => {
      result.add(toCardanoMetadatum(val));
    });
    return TransactionMetadatum.newList(result);
  } else {
    throw new Error("metadatumToObj: Unsupported Metadatum type");
  }
};
