import { Serialization } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import type {
  AuxiliaryDataPrototype,
  Metadatum,
  MetadatumPrototype,
  TxMetadata,
} from "@meshsdk/common";

import {
  AuxilliaryData,
  PlutusV1Script,
  PlutusV2Script,
  PlutusV3Script,
  type AuxiliaryData,
} from "../types";
import { toCardanoMetadataMap } from "../utils/metadata";
import { nativeScriptPrototypeToCardano } from "./native-script";

const metadatumPrototypeToMesh = (m: MetadatumPrototype): Metadatum => {
  switch (m.type) {
    case "INT":
      return BigInt(m.value);
    case "BYTES":
      return Uint8Array.from(m.value);
    case "STRING":
      return m.value;
    case "LIST":
      return m.value.map(metadatumPrototypeToMesh);
    case "MAP": {
      const map = new Map<Metadatum, Metadatum>();
      m.value.forEach(([k, v]) => map.set(metadatumPrototypeToMesh(k), metadatumPrototypeToMesh(v)));
      return map;
    }
  }
};

const txMetadataPrototypeToMesh = (metadata: Record<string, MetadatumPrototype>): TxMetadata => {
  const result: TxMetadata = new Map();
  for (const [label, value] of Object.entries(metadata)) {
    result.set(BigInt(label), metadatumPrototypeToMesh(value));
  }
  return result;
};

export const auxiliaryDataPrototypeToCardano = (
  proto: AuxiliaryDataPrototype,
): AuxiliaryData => {
  // "AuxilliaryData" (extra "l") is `../types`'s own re-export name for the CST value/constructor
  // (`Serialization.AuxiliaryData`); the correctly-spelled `AuxiliaryData` is that module's
  // type-only export for the same class — not a typo introduced here.
  const result = new AuxilliaryData();

  if (proto.metadata) {
    result.setMetadata(
      new Serialization.GeneralTransactionMetadata(
        toCardanoMetadataMap(txMetadataPrototypeToMesh(proto.metadata)),
      ),
    );
  }

  if (proto.native_scripts?.length) {
    result.setNativeScripts(proto.native_scripts.map(nativeScriptPrototypeToCardano));
  }

  // CDDL `auxiliary_data_map` keys 2 / 3 / 4, one per Plutus language version — same 1:1 mapping
  // as the witness set, no version guessing.
  if (proto.plutus_v1_scripts?.length) {
    result.setPlutusV1Scripts(
      proto.plutus_v1_scripts.map((cbor) => PlutusV1Script.fromCbor(HexBlob(cbor))),
    );
  }

  if (proto.plutus_v2_scripts?.length) {
    result.setPlutusV2Scripts(
      proto.plutus_v2_scripts.map((cbor) => PlutusV2Script.fromCbor(HexBlob(cbor))),
    );
  }

  if (proto.plutus_v3_scripts?.length) {
    result.setPlutusV3Scripts(
      proto.plutus_v3_scripts.map((cbor) => PlutusV3Script.fromCbor(HexBlob(cbor))),
    );
  }

  return result;
};
