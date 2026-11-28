import { Serialization } from "@cardano-sdk/core";

import type {
  AuxiliaryDataPrototype,
  MetadatumPrototype,
  TxMetadataPrototype,
} from "@meshsdk/common";

import { AuxiliaryData, CborReader, HexBlob, TransactionMetadatum } from "../types";
import { nativeScriptToPrototype } from "./native-script";

const { CborReaderState, TransactionMetadatumKind } = Serialization;

/** The metadatum the reader is at, in the prototype shape, read from the bytes in their order: a
 * map keeps every pair it is written with, a repeated key with each of its values, and no key is
 * looked up. An integer written as a big number is read by the value decoder. */
const readMetadatum = (reader: CborReader): MetadatumPrototype => {
  switch (reader.peekState()) {
    case CborReaderState.UnsignedInteger:
    case CborReaderState.NegativeInteger:
      return { type: "INT", value: reader.readInt() };
    case CborReaderState.ByteString:
    case CborReaderState.StartIndefiniteLengthByteString:
      return { type: "BYTES", value: [...reader.readByteString()] };
    case CborReaderState.TextString:
    case CborReaderState.StartIndefiniteLengthTextString:
      return { type: "STRING", value: reader.readTextString() };
    case CborReaderState.StartArray: {
      const value: MetadatumPrototype[] = [];
      reader.readStartArray();
      while (reader.peekState() !== CborReaderState.EndArray) value.push(readMetadatum(reader));
      reader.readEndArray();
      return { type: "LIST", value };
    }
    case CborReaderState.StartMap: {
      const value: [MetadatumPrototype, MetadatumPrototype][] = [];
      reader.readStartMap();
      while (reader.peekState() !== CborReaderState.EndMap)
        value.push([readMetadatum(reader), readMetadatum(reader)]);
      reader.readEndMap();
      return { type: "MAP", value };
    }
    default:
      break;
  }
  const metadatum = TransactionMetadatum.fromCbor(HexBlob.fromBytes(reader.readEncodedValue()));
  if (metadatum.getKind() === TransactionMetadatumKind.Integer)
    return { type: "INT", value: metadatum.asInteger()! };
  throw new Error(`Unsupported metadatum kind: ${metadatum.getKind()}`);
};

const metadatumToPrototype = (metadatum: TransactionMetadatum): MetadatumPrototype =>
  readMetadatum(new CborReader(metadatum.toCbor()));

/** Inverse of `../tx-prototype-to-cbor/auxiliary-data.ts`. */
export const auxiliaryDataToPrototype = (aux: AuxiliaryData): AuxiliaryDataPrototype => {
  const result: AuxiliaryDataPrototype = { prefer_alonzo_format: true };

  const metadata = aux.metadata();
  if (metadata) {
    const entries = metadata.metadata();
    if (entries && entries.size > 0) {
      const out: TxMetadataPrototype = {};
      for (const [label, value] of entries) {
        out[label.toString()] = metadatumToPrototype(value);
      }
      result.metadata = out;
    }
  }

  const nativeScripts = aux.nativeScripts();
  if (nativeScripts?.length) {
    result.native_scripts = nativeScripts.map(nativeScriptToPrototype);
  }

  // Auxiliary-data map keys 2 / 3 / 4, one per Plutus language version.
  const v1 = aux.plutusV1Scripts();
  if (v1?.length) result.plutus_v1_scripts = v1.map((s) => s.toCbor().toString());
  const v2 = aux.plutusV2Scripts();
  if (v2?.length) result.plutus_v2_scripts = v2.map((s) => s.toCbor().toString());
  const v3 = aux.plutusV3Scripts();
  if (v3?.length) result.plutus_v3_scripts = v3.map((s) => s.toCbor().toString());

  return result;
};
