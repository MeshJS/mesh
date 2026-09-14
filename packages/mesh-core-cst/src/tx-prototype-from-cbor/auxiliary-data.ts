import { Serialization } from "@cardano-sdk/core";

import type {
  AuxiliaryDataPrototype,
  MetadatumPrototype,
  TxMetadataPrototype,
} from "@meshsdk/common";

import { AuxiliaryData, TransactionMetadatum } from "../types";
import { nativeScriptToPrototype } from "./native-script";

const { TransactionMetadatumKind } = Serialization;

const metadatumToPrototype = (metadatum: TransactionMetadatum): MetadatumPrototype => {
  switch (metadatum.getKind()) {
    case TransactionMetadatumKind.Integer:
      return { type: "INT", value: metadatum.asInteger()! };
    case TransactionMetadatumKind.Bytes:
      return { type: "BYTES", value: [...metadatum.asBytes()!] };
    case TransactionMetadatumKind.Text:
      return { type: "STRING", value: metadatum.asText()! };
    case TransactionMetadatumKind.List: {
      const list = metadatum.asList()!;
      const value: MetadatumPrototype[] = [];
      for (let i = 0; i < list.getLength(); i++) value.push(metadatumToPrototype(list.get(i)));
      return { type: "LIST", value };
    }
    case TransactionMetadatumKind.Map: {
      const map = metadatum.asMap()!;
      const keys = map.getKeys();
      const value: [MetadatumPrototype, MetadatumPrototype][] = [];
      for (let i = 0; i < keys.getLength(); i++) {
        const key = keys.get(i);
        value.push([metadatumToPrototype(key), metadatumToPrototype(map.get(key)!)]);
      }
      return { type: "MAP", value };
    }
    default:
      throw new Error(`Unsupported metadatum kind: ${metadatum.getKind()}`);
  }
};

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
