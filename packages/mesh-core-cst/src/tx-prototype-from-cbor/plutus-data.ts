import { Serialization } from "@cardano-sdk/core";

import type { PlutusDataPrototype, PlutusDataVariant } from "@meshsdk/common";

import {
  CborReader,
  CborWriter,
  ConstrPlutusData,
  HexBlob,
  PlutusData,
} from "../types";

const { CborReaderState, CborTag } = Serialization;

/** The tag of a constructor in the general form, `102([alternative, fields])` */
const GENERAL_FORM_TAG = 102;

/** The alternatives of the first tag heads read, up to `REMEMBERED` of them */
const ALTERNATIVES = new Map<string, bigint>();
const REMEMBERED = 256;

/** An empty list, as the writer of `@cardano-sdk/core` writes it */
const EMPTY_LIST = new CborWriter().writeStartArray(0).encodeAsHex();

/** The alternative of a constructor written with a tag other than the general form's, as the
 * value decoder of `@cardano-sdk/core` reads it: asked of its constructor class for the tag's
 * head as given (`head`, hex) before an empty list, so that the fields are not decoded again and
 * the tag is never written anew, whatever its value up to 2^64-1 */
const compactAlternative = (head: string): bigint => {
  let alternative = ALTERNATIVES.get(head);
  if (alternative === undefined) {
    alternative = ConstrPlutusData.fromCbor(
      HexBlob(`${head}${EMPTY_LIST}`),
    ).getAlternative();
    if (ALTERNATIVES.size < REMEMBERED) ALTERNATIVES.set(head, alternative);
  }
  return alternative;
};

/** The offset of the reader in `cbor`, the hex it reads */
const offsetIn = (cbor: string, reader: CborReader): number =>
  cbor.length / 2 - reader.getBytesRemaining();

/** The items of a list the reader of `cbor` is at, each read as `readPrototype` reads it */
const readList = (reader: CborReader, cbor: string): PlutusDataPrototype[] => {
  const items: PlutusDataPrototype[] = [];
  reader.readStartArray();
  while (reader.peekState() !== CborReaderState.EndArray)
    items.push(readPrototype(reader, cbor));
  reader.readEndArray();
  return items;
};

/** The Plutus data item the reader of `cbor` is at, in the prototype shape, read from the bytes
 * in their order: a map keeps every pair it is written with, a repeated key with each of its
 * values, and no key is looked up. An integer written as a big number is read by the value
 * decoder. A tag is judged as the reader gives it, the way the value decoder judges it. */
const readPrototype = (reader: CborReader, cbor: string): PlutusDataPrototype => {
  switch (reader.peekState()) {
    case CborReaderState.UnsignedInteger:
    case CborReaderState.NegativeInteger:
      return { type: "INTEGER", value: reader.readInt() };
    case CborReaderState.ByteString:
    case CborReaderState.StartIndefiniteLengthByteString:
      return { type: "BYTES", value: Buffer.from(reader.readByteString()).toString("hex") };
    case CborReaderState.StartArray:
      return { type: "LIST", value: readList(reader, cbor) };
    case CborReaderState.StartMap: {
      const value: [PlutusDataPrototype, PlutusDataPrototype][] = [];
      reader.readStartMap();
      while (reader.peekState() !== CborReaderState.EndMap)
        value.push([readPrototype(reader, cbor), readPrototype(reader, cbor)]);
      reader.readEndMap();
      return { type: "MAP", value };
    }
    case CborReaderState.Tag: {
      const tag: number = reader.peekTag();
      if (tag === CborTag.UnsignedBigNum || tag === CborTag.NegativeBigNum) {
        const data = PlutusData.fromCbor(HexBlob.fromBytes(reader.readEncodedValue()));
        return { type: "INTEGER", value: data.asInteger()! };
      }
      const start = offsetIn(cbor, reader);
      reader.readTag();
      if (tag !== GENERAL_FORM_TAG) {
        const head = cbor.slice(start * 2, offsetIn(cbor, reader) * 2);
        const alternative = compactAlternative(head);
        return { type: "CONSTR", alternative, fields: readList(reader, cbor) };
      }
      reader.readStartArray();
      const alternative = reader.readInt();
      const fields = readList(reader, cbor);
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
export const plutusDataToPrototype = (data: PlutusData): PlutusDataPrototype => {
  const cbor = data.toCbor();
  return readPrototype(new CborReader(cbor), cbor);
};

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
