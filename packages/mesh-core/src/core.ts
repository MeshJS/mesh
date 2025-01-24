// todo TW: need to replace CST
import * as core from "@meshsdk/core-cst";

const applyParamsToScript = core.applyParamsToScript;
const applyCborEncoding = (script: string) => {
  return Buffer.from(
    core.applyEncoding(Buffer.from(script, "hex"), "DoubleCBOR"),
  ).toString("hex");
};

export { core, applyParamsToScript, applyCborEncoding };
