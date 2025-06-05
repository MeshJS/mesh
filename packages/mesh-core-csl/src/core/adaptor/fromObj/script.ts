import { ScriptSource, SimpleScriptSource } from "@meshsdk/common";

export const scriptSourceFromObj = (obj: any): ScriptSource => {
  if ("script" in obj) {
    return {
      type: "Script",
      script: obj.script,
    };
  } else if ("scriptCbor" in obj) {
    return {
      type: "ScriptCbor",
      scriptCbor: obj.scriptCbor,
    };
  } else if ("scriptHash" in obj) {
    return {
      type: "ScriptHash",
      scriptHash: obj.scriptHash,
    };
  }

  throw new Error(
    `scriptSourceFromObj: Unknown script source type in object: ${JSON.stringify(obj)}`,
  );
};

export const simpleScriptSourceFromObj = (obj: any): SimpleScriptSource => {
  if ("script" in obj) {
    return {
      type: "Script",
      script: obj.script,
    };
  } else if ("scriptCbor" in obj) {
    return {
      type: "ScriptCbor",
      scriptCbor: obj.scriptCbor,
    };
  } else if ("scriptHash" in obj) {
    return {
      type: "ScriptHash",
      scriptHash: obj.scriptHash,
    };
  }

  throw new Error(
    `simpleScriptSourceFromObj: Unknown simple script source type in object: ${JSON.stringify(obj)}`,
  );
};
