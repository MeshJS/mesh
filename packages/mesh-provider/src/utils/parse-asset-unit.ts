import { fromUTF8, POLICY_ID_LENGTH } from "@meshsdk/common";

export const parseAssetUnit = (unit: string) => {
  const policyId = unit.slice(0, POLICY_ID_LENGTH);
  const assetName = unit.includes(".")
    ? fromUTF8(unit.split(".")[1] || "")
    : unit.slice(POLICY_ID_LENGTH);

  return { policyId, assetName };
};
