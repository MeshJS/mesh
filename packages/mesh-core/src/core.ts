import { Data, PlutusDataType } from "@meshsdk/common";
import * as core from "@meshsdk/core-cst";

/**
 * Apply parameters to a given CIP57 blueprint compiledCode,
 * making it ready for use in transactions
 *
 * @param rawScript - The raw script CborHex from blueprint.
 * @param params - The parameters to apply, in an array.
 * @param type - The type of the parameters, default to be Mesh's Data type. It could also be in JSON and raw CBOR.
 * @returns The double-cbor encoded script CborHex with the parameters applied.
 */
const applyParamsToScript = (
  rawScript: string,
  params: object[] | Data[],
  type?: PlutusDataType,
): string => core.applyParamsToScript(rawScript, params, type);

/**
 * Apply Cbor encoding to rawScript from CIP57 blueprint compiledCode,
 * making it ready for use in transactions
 *
 * @param rawScript - The raw script CborHex from blueprint.
 * @returns The double-cbor encoded script CborHex.
 */
const applyCborEncoding = (rawScript: string) => {
  return Buffer.from(
    core.applyEncoding(Buffer.from(rawScript, "hex"), "SingleCBOR"),
  ).toString("hex");
};

export { core, applyParamsToScript, applyCborEncoding };
