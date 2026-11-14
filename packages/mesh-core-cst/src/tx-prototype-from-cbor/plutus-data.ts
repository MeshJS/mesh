import { Serialization } from "@cardano-sdk/core";

import type { PlutusDataPrototype, PlutusDataVariant } from "@meshsdk/common";

import { CborReader, HexBlob, PlutusData } from "../types";

const { CborReaderState, CborTag } = Serialization;

/** The tag of a constructor in the general form, `102([alternative, fields])` */
const GENERAL_FORM_TAG = 102;

/** The alternative of a constructor written with a compact tag, as the decoder reads it: tags
 * 121 to 127 are alternatives 0 to 6, tags 1280 to 1400 alternatives 7 to 127, and any other
 * tag is read as the general form's */
const compactAlternative = (tag: number): bigint => {
  if (tag >= 121 && tag <= 127) return BigInt(tag - 121);
  if (tag >= 1280 && tag <= 1400) return BigInt(tag - 1280 + 7);
  return BigInt(GENERAL_FORM_TAG);
};

/** The items of a list the reader is at, each read as `readPrototype` reads it */
const readList = (reader: CborReader): PlutusDataPrototype[] => {
  const items: PlutusDataPrototype[] = [];
  reader.readStartArray();
  while (reader.peekState() !== CborReaderState.EndArray) items.push(readPrototype(reader));
  reader.readEndArray();
  return items;
};

/** The Plutus data item the reader is at, in the prototype shape, read from the bytes in their
 * order: a map keeps every pair it is written with, a repeated key with each of its values, and
 * no key is looked up. An integer written as a big number is read by the value decoder. */
const readPrototype = (reader: CborReader): PlutusDataPrototype => {
  switch (reader.peekState()) {
    case CborReaderState.UnsignedInteger:
    case CborReaderState.NegativeInteger:
      return { type: "INTEGER", value: reader.readInt() };
    case CborReaderState.ByteString:
    case CborReaderState.StartIndefiniteLengthByteString:
      return { type: "BYTES", value: Buffer.from(reader.readByteString()).toString("hex") };
    case CborReaderState.StartArray:
      return { type: "LIST", value: readList(reader) };
    case CborReaderState.StartMap: {
      const value: [PlutusDataPrototype, PlutusDataPrototype][] = [];
      reader.readStartMap();
      while (reader.peekState() !== CborReaderState.EndMap)
        value.push([readPrototype(reader), readPrototype(reader)]);
      reader.readEndMap();
      return { type: "MAP", value };
    }
    case CborReaderState.Tag: {
      const tag = Number(reader.peekTag());
      if (tag === CborTag.UnsignedBigNum || tag === CborTag.NegativeBigNum) {
        const data = PlutusData.fromCbor(HexBlob.fromBytes(reader.readEncodedValue()));
        return { type: "INTEGER", value: data.asInteger()! };
      }
      reader.readTag();
      if (tag !== GENERAL_FORM_TAG)
        return { type: "CONSTR", alternative: compactAlternative(tag), fields: readList(reader) };
      reader.readStartArray();
      const alternative = reader.readInt();
      const fields = readList(reader);
      reader.readEndArray();
      return { type: "CONSTR", alternative, fields };
    }
    default:
      throw new Error(`Unexpected CBOR in Plutus data: ${reader.peekState()}`);
  }
};

/** Inverse of `../tx-prototype-to-cbor/plutus-data.ts`. Reads CST's `PlutusData` back into the
 * ledger-level tagged prototype shape, from its bytes: a map shows every pair it holds, in their
 * order, a repeated key included. */
export const plutusDataToPrototype = (data: PlutusData): PlutusDataPrototype =>
  readPrototype(new CborReader(data.toCbor()));

/**
 * Decodes to the `MANUAL` arm by default, which is the round-trippable choice: `CBOR` would also
 * be valid but would collapse every datum to an opaque hex string, so a `MANUAL` input would not
 * survive an encode/decode cycle. Callers who want the opaque form can use `plutusDataToCborVariant`.
 */
export const plutusDataToVariant = (data: PlutusData): PlutusDataVariant => ({
  type: "MANUAL",
  data: plutusDataToPrototype(data),
});

export const plutusDataToCborVariant = (data: PlutusData): PlutusDataVariant => ({
  type: "CBOR",
  hex: data.toCbor(),
});
