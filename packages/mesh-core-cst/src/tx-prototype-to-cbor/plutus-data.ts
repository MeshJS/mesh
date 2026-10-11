import { HexBlob } from "@cardano-sdk/util";

import type {
  PlutusDataPrototype,
  PlutusDataVariant,
} from "@meshsdk/common";

import {
  ConstrPlutusData,
  PlutusData,
  PlutusList,
  PlutusMap,
} from "../types";

/** Direct port of whisky's `tx_prototype/convert/plutus_data.rs` — `PlutusDataPrototype` is the
 * raw ledger-level tagged datum shape (not Mesh's own convenience `Data`/`BuilderData`), so this
 * can't reuse `toPlutusData`/`fromBuilderToPlutusData` (`../utils/data.ts`), which convert from
 * that different, higher-level shape. */
export const plutusDataPrototypeToCardano = (
  data: PlutusDataPrototype,
): PlutusData => {
  switch (data.type) {
    case "INTEGER":
      return PlutusData.newInteger(BigInt(data.value));
    case "BYTES":
      return PlutusData.newBytes(Buffer.from(data.value, "hex"));
    case "LIST": {
      const list = new PlutusList();
      data.value.forEach((el) => list.add(plutusDataPrototypeToCardano(el)));
      return PlutusData.newList(list);
    }
    case "MAP": {
      const map = new PlutusMap();
      data.value.forEach(([k, v]) =>
        map.insert(plutusDataPrototypeToCardano(k), plutusDataPrototypeToCardano(v)),
      );
      return PlutusData.newMap(map);
    }
    case "CONSTR": {
      const fields = new PlutusList();
      data.fields.forEach((el) => fields.add(plutusDataPrototypeToCardano(el)));
      return PlutusData.newConstrPlutusData(
        new ConstrPlutusData(BigInt(data.alternative), fields),
      );
    }
  }
};

export const plutusDataVariantToCardano = (
  data: PlutusDataVariant,
): PlutusData =>
  data.type === "CBOR"
    ? PlutusData.fromCbor(HexBlob(data.hex))
    : plutusDataPrototypeToCardano(data.data);
