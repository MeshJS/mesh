import { BuilderData, Redeemer } from "@meshsdk/common";

import { csl, toPlutusData } from "../../../deser";

export const builderDataToCbor = ({ type, content }: BuilderData): string => {
  if (type === "Mesh") {
    return toPlutusData(content).to_hex();
  }
  if (type === "CBOR") {
    return csl.PlutusData.from_hex(content as string).to_hex();
  }
  return csl.PlutusData.from_json(
    content as string,
    csl.PlutusDatumSchema.DetailedSchema,
  ).to_hex();
};

export const redeemerToObj = (redeemer: Redeemer): object => {
  return {
    data: builderDataToCbor(redeemer.data),
    exUnits: redeemer.exUnits,
  };
};
