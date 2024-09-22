import {
  Data,
  SpendingValidator,
  applyParamsToScript,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";
import plutusBlueprint from "../../onchain/src/plutus.json" with { type: "json" };
import { AssetClass, AssetClassT } from "../types.ts";

const asteriaValidator = plutusBlueprint.validators.find(
  ({ title }) => title === "asteria.spend"
);

if (!asteriaValidator) {
  throw new Error("Asteria validator indexed with 'asteria.spend' failed!");
}

const ASTERIA_SCRIPT: SpendingValidator["script"] =
  asteriaValidator.compiledCode;

const ValidatorParam = Data.Tuple([
  AssetClass,
  Data.Integer({ minimum: 0 }),
  Data.Integer({ minimum: 0, maximum: 100 }),
]);
type ValidatorParamT = Data.Static<typeof ValidatorParam>;

function buildAsteriaValidator(
  admin_token: AssetClassT,
  ship_mint_lovelace_fee: bigint,
  max_asteria_mining: bigint
): SpendingValidator {
  const appliedValidator = applyParamsToScript<ValidatorParamT>(
    ASTERIA_SCRIPT,
    [admin_token, ship_mint_lovelace_fee, max_asteria_mining],
    ValidatorParam as unknown as ValidatorParamT
  );

  return {
    type: "PlutusV2",
    script: appliedValidator,
  };
}

export { buildAsteriaValidator };
