import {
Data,
  SpendingValidator,
  applyParamsToScript,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";
import plutusBlueprint from "../../onchain/src/plutus.json" with { type: "json" };
import { AssetClass, AssetClassT } from "../types.ts";

const deployValidator = plutusBlueprint.validators.find(
  ({ title }) => title === "deploy.spend"
);

if (!deployValidator) {
  throw new Error("Deploy validator indexed with 'deploy.spend' failed!");
}

const DEPLOY_SCRIPT: SpendingValidator["script"] =
  deployValidator.compiledCode;


const ValidatorParam = Data.Tuple([AssetClass]);
type ValidatorParamT = Data.Static<typeof ValidatorParam>;

function buildDeployValidator(admin_token: AssetClassT): SpendingValidator {
  const appliedValidator = applyParamsToScript<ValidatorParamT>(
    DEPLOY_SCRIPT,
    [admin_token],
    ValidatorParam as unknown as ValidatorParamT
  );

  return {
    type: "PlutusV2",
    script: appliedValidator,
  };
}

export { buildDeployValidator };
