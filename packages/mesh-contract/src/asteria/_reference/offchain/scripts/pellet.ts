import {
  Data,
  SpendingValidator,
  applyParamsToScript,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";
import plutusBlueprint from "../../onchain/src/plutus.json" with { type: "json" };
import { AssetClass, AssetClassT } from "../types.ts";

const pelletValidator = plutusBlueprint.validators.find(
  ({ title }) => title === "pellet.spend"
);

if (!pelletValidator) {
  throw new Error("Pellet validator indexed with 'pellet.spend' failed!");
}

const PELLET_SCRIPT: SpendingValidator["script"] = pelletValidator.compiledCode;

const ValidatorParam = Data.Tuple([AssetClass]);
type ValidatorParamT = Data.Static<typeof ValidatorParam>;

function buildPelletValidator(admin_token: AssetClassT): SpendingValidator {
  const appliedValidator = applyParamsToScript<ValidatorParamT>(
    PELLET_SCRIPT,
    [admin_token],
    ValidatorParam as unknown as ValidatorParamT
  );

  return {
    type: "PlutusV2",
    script: appliedValidator,
  };
}

export { buildPelletValidator };
