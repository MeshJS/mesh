import { Data, PlutusDataType } from "@meshsdk/common";

import { csl, toPlutusData } from "../deser";

/**
 * Apply parameters to a given script blueprint.
 *
 * @param rawScript - The raw script CborHex from blueprint.
 * @param params - The parameters to apply, in an array.
 * @param type - The type of the parameters, default to be Mesh's Data type. It could also be in JSON and raw CBOR.
 * @returns The double-cbor encoded script CborHex with the parameters applied.
 */
export const applyParamsToScript = (
  rawScript: string,
  params: object[] | Data[],
  type: PlutusDataType = "Mesh",
): string => {
  const cslParams = csl.JsVecString.new();
  let paramType = csl.BuilderDataType.CBOR;

  switch (type) {
    case "JSON":
      paramType = csl.BuilderDataType.JSON;
      params.forEach((param) => {
        if (typeof param === "object") {
          cslParams.add(JSON.stringify(param));
        } else if (typeof param === "string") {
          cslParams.add(param);
        }
      });
      break;

    case "Mesh":
      params.forEach((param) => {
        const paramCbor = toPlutusData(param as Data);
        cslParams.add(paramCbor.to_hex());
      });
      break;

    default:
      params.forEach((param) => {
        cslParams.add(param as string);
      });
      break;
  }

  return csl.js_apply_params_to_script(rawScript, cslParams, paramType);
};

/**
 * Apply Cbor encoding.
 *
 * @param rawScript - The raw script CborHex from blueprint.
 * @returns The double-cbor encoded script CborHex.
 */
export const applyCborEncoding = (rawScript: string): string => {
  return csl.js_apply_params_to_script(
    rawScript,
    csl.JsVecString.new(),
    csl.BuilderDataType.CBOR,
  );
};
