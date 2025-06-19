import { MintItem } from "@meshsdk/common";

import { redeemerFromObj } from "./data";
import { scriptSourceFromObj, simpleScriptSourceFromObj } from "./script";

/**
 * Convert an object representation back to a MintItem
 * @param obj The object representation of a MintItem
 * @returns The MintItem instance
 */
export const mintItemFromObj = (obj: any): MintItem => {
  if ("scriptMint" in obj) {
    return plutusMintItemFromObj(obj.scriptMint);
  }

  if ("simpleScriptMint" in obj) {
    return nativeMintItemFromObj(obj.simpleScriptMint);
  }

  throw new Error(
    `mintItemFromObj: Unknown mint item format: ${JSON.stringify(obj)}`,
  );
};

/**
 * Convert a Plutus mint item object representation back to a MintItem
 * @param obj The object representation of a Plutus mint item
 * @returns The MintItem instance with Plutus script
 */
export const plutusMintItemFromObj = (obj: any): MintItem => {
  const mintParams = mintParametersFromObj(obj.mint);
  return {
    ...mintParams,
    type: "Plutus",
    scriptSource: scriptSourceFromObj(obj.scriptSource),
    redeemer: obj.redeemer ? redeemerFromObj(obj.redeemer) : undefined,
  };
};

/**
 * Convert a Native mint item object representation back to a MintItem
 * @param obj The object representation of a Native mint item
 * @returns The MintItem instance with Native script
 */
export const nativeMintItemFromObj = (obj: any): MintItem => {
  const mintParams = mintParametersFromObj(obj.mint);
  return {
    ...mintParams,
    type: "Native",
    scriptSource: simpleScriptSourceFromObj(obj.scriptSource),
  };
};

/**
 * Convert mint parameters object representation back to MintItem parameters
 * @param obj The object representation of mint parameters
 * @returns The mint parameters
 */
export const mintParametersFromObj = (
  obj: any,
): Omit<MintItem, "type" | "scriptSource" | "redeemer"> => {
  return {
    policyId: obj.policyId,
    assetName: obj.assetName,
    amount: obj.amount.toString(),
  };
};
