import { Output, PlutusScript } from "@meshsdk/common";

import { builderDataToCbor } from "./data";

export const outputToObj = (output: Output): object => {
  let datum: object | null = null;
  if (output.datum) {
    switch (output.datum.type) {
      case "Inline":
        datum = { inline: builderDataToCbor(output.datum.data) };
        break;
      case "Hash":
        datum = { hash: builderDataToCbor(output.datum.data) };
        break;
      case "Embedded":
        datum = { embedded: builderDataToCbor(output.datum.data) };
        break;
    }
  }

  // TODO: add native script
  const refScript = output.referenceScript as PlutusScript;

  return {
    address: output.address,
    amount: output.amount,
    datum,
    referenceScript: output.referenceScript
      ? {
          providedScriptSource: {
            scriptCbor: refScript.code,
            languageVersion: refScript.version.toLocaleLowerCase(),
          },
        }
      : null,
  };
};
