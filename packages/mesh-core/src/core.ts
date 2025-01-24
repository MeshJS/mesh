// todo TW: need to replace CST
import * as core from "@meshsdk/core-cst";

const applyParamsToScript = core.applyParamsToScript;
const applyCborEncoding = (script: string) => {
  core.applyEncoding(Buffer.from(script, "hex"), "DoubleCBOR");
};

export { core, applyParamsToScript, applyCborEncoding };
