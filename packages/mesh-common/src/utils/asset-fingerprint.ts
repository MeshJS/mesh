import CIP14 from "@emurgo/cip14-js";

import { toBytes } from "../data";

export const AssetFingerprint = CIP14;

export const resolveFingerprint = (policyId: string, assetName: string) => {
  return (AssetFingerprint as any).default // todo: check the behaviour
    .fromParts(toBytes(policyId), toBytes(assetName))
    .fingerprint();
};
