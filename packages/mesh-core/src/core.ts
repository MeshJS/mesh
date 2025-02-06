import * as core from "@meshsdk/core-cst";

const applyParamsToScript = core.applyParamsToScript;
const applyCborEncoding = (script: string) => {
  return Buffer.from(
    core.applyEncoding(Buffer.from(script, "hex"), "SingleCBOR"),
  ).toString("hex");
};

export { core, applyParamsToScript, applyCborEncoding };
