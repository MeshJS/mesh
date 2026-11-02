import { Serialization } from "@cardano-sdk/core";

import { Metadatum, ScriptMetadata, TxMetadata } from "@meshsdk/common";

import { AuxiliaryData, TransactionMetadatum } from "../types";

const { TransactionMetadatumKind } = Serialization;

const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Inverse of `toCardanoMetadatum`: integers that fit a JS number are returned as numbers */
export const fromCardanoMetadatum = (
  metadatum: TransactionMetadatum,
): Metadatum => {
  switch (metadatum.getKind()) {
    case TransactionMetadatumKind.Integer: {
      const value = metadatum.asInteger()!;
      return value >= MIN_SAFE && value <= MAX_SAFE ? Number(value) : value;
    }
    case TransactionMetadatumKind.Bytes:
      return metadatum.asBytes()!;
    case TransactionMetadatumKind.Text:
      return metadatum.asText()!;
    case TransactionMetadatumKind.List: {
      const list = metadatum.asList()!;
      const result: Metadatum[] = [];
      for (let i = 0; i < list.getLength(); i++) {
        result.push(fromCardanoMetadatum(list.get(i)));
      }
      return result;
    }
    case TransactionMetadatumKind.Map: {
      const map = metadatum.asMap()!;
      const keys = map.getKeys();
      const result = new Map<Metadatum, Metadatum>();
      for (let i = 0; i < keys.getLength(); i++) {
        const key = keys.get(i);
        result.set(
          fromCardanoMetadatum(key),
          fromCardanoMetadatum(map.get(key)!),
        );
      }
      return result;
    }
    default:
      throw new Error(`Unsupported metadatum kind: ${metadatum.getKind()}`);
  }
};

export const parseMetadata = (
  auxiliaryData: AuxiliaryData | undefined,
): TxMetadata => {
  const result: TxMetadata = new Map<bigint, Metadatum>();
  const entries = auxiliaryData?.metadata()?.metadata();
  if (!entries) return result;
  for (const [label, value] of entries) {
    result.set(label, fromCardanoMetadatum(value));
  }
  return result;
};

export const parseScriptMetadata = (
  auxiliaryData: AuxiliaryData | undefined,
): ScriptMetadata[] => {
  if (!auxiliaryData) return [];
  const result: ScriptMetadata[] = [];
  const push = (
    scriptType: ScriptMetadata["scriptType"],
    scripts: { toCbor(): { toString(): string } }[] | undefined,
  ) => {
    for (const script of scripts ?? []) {
      result.push({ scriptType, scriptCbor: script.toCbor().toString() });
    }
  };
  push("Native", auxiliaryData.nativeScripts());
  push("PlutusV1", auxiliaryData.plutusV1Scripts());
  push("PlutusV2", auxiliaryData.plutusV2Scripts());
  push("PlutusV3", auxiliaryData.plutusV3Scripts());
  return result;
};
