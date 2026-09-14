import type { PlutusDataPrototype, PlutusDataVariant } from "@meshsdk/common";

import { PlutusData, PlutusDataKind } from "../types";

/** Inverse of `../tx-prototype-to-cbor/plutus-data.ts`. Walks CST's `PlutusData` tree back into
 * the ledger-level tagged prototype shape. */
export const plutusDataToPrototype = (data: PlutusData): PlutusDataPrototype => {
  switch (data.getKind()) {
    case PlutusDataKind.Integer:
      return { type: "INTEGER", value: data.asInteger()! };
    case PlutusDataKind.Bytes:
      return { type: "BYTES", value: Buffer.from(data.asBoundedBytes()!).toString("hex") };
    case PlutusDataKind.List: {
      const list = data.asList()!;
      const value: PlutusDataPrototype[] = [];
      for (let i = 0; i < list.getLength(); i++) value.push(plutusDataToPrototype(list.get(i)));
      return { type: "LIST", value };
    }
    case PlutusDataKind.Map: {
      const map = data.asMap()!;
      const keys = map.getKeys();
      const value: [PlutusDataPrototype, PlutusDataPrototype][] = [];
      for (let i = 0; i < keys.getLength(); i++) {
        const key = keys.get(i);
        value.push([plutusDataToPrototype(key), plutusDataToPrototype(map.get(key)!)]);
      }
      return { type: "MAP", value };
    }
    case PlutusDataKind.ConstrPlutusData: {
      const constr = data.asConstrPlutusData()!;
      const fields = constr.getData();
      const out: PlutusDataPrototype[] = [];
      for (let i = 0; i < fields.getLength(); i++) out.push(plutusDataToPrototype(fields.get(i)));
      return { type: "CONSTR", alternative: constr.getAlternative(), fields: out };
    }
  }
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
