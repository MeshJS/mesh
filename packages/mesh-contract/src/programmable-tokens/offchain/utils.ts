import subStandard_plutusScript from "./dummy/plutus.json";
import standard_plutusScript from "./plutus.json";
import { RegistryDatum } from "./types";

export const findValidator = (
  validatorName: string,
  purpose: string,
  isSubStandard?: boolean,
) => {
  if (isSubStandard) {
    const validator = subStandard_plutusScript.validators.find(
      ({ title }) => title === `${validatorName}.${purpose}`,
    );
    if (!validator) {
      throw new Error(
        `Validator ${validatorName}.${purpose} not found`,
      );
    }
    return validator.compiledCode;
  } else {
    const validator = standard_plutusScript.validators.find(
      ({ title }) => title === `${validatorName}.${validatorName}.${purpose}`,
    );
    if (!validator) {
      throw new Error(
        `Validator ${validatorName}.${validatorName}.${purpose} not found`,
      );
    }
    return validator.compiledCode;
  }
};

export function parseRegistryDatum(datum: any): RegistryDatum | null {
  if (!datum?.fields || datum.fields.length < 5) {
    return null;
  }
  return {
    key: datum.fields[0].bytes,
    next: datum.fields[1].bytes,
    transferScriptHash: datum.fields[2].bytes,
    thirdPartyScriptHash: datum.fields[3].bytes,
    metadata: datum.fields[4].bytes,
  };
}