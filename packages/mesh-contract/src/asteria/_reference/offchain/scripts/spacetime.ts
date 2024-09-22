import { Address, Data, SpendingValidator, applyParamsToScript } from "https://deno.land/x/lucid@0.10.7/mod.ts";
import plutusBlueprint from "../../onchain/src/plutus.json" with { type: "json" };
import { AssetClass, AssetClassT, Speed, SpeedT } from "../types.ts";

const spacetimeValidator = plutusBlueprint.validators.find(
  ({ title }) => title === "spacetime.spend"
);

if (!spacetimeValidator) {
  throw new Error("Spacetime validator indexed with 'spacetime.spend' failed!");
}

const SPACETIME_SCRIPT: SpendingValidator["script"] =
  spacetimeValidator.compiledCode;

const ValidatorParam = Data.Tuple([
  Data.Bytes(),
  Data.Bytes(),
  AssetClass,
  Speed,
  Data.Integer({ minimum: 0 }),
  Data.Integer({ minimum: 0 }),
  Data.Integer({ minimum: 0 }),
  Data.Integer({ minimum: 0 }),
]);
type ValidatorParamT = Data.Static<typeof ValidatorParam>;

function buildSpacetimeValidator(
  pellet_validator_address: Address,
  asteria_validator_address: Address,
  admin_token: AssetClassT,
  max_speed: SpeedT,
  max_ship_fuel: bigint,
  fuel_per_step: bigint,
  initial_fuel: bigint,
  min_asteria_distance: bigint,
): SpendingValidator {
  const appliedValidator = applyParamsToScript<ValidatorParamT>(
    SPACETIME_SCRIPT,
    [
      pellet_validator_address,
      asteria_validator_address,
      admin_token,
      max_speed,
      max_ship_fuel,
      fuel_per_step,
      initial_fuel,
      min_asteria_distance
    ],
    ValidatorParam as unknown as ValidatorParamT
  );

  return {
    type: "PlutusV2",
    script: appliedValidator,
  };
}

export { buildSpacetimeValidator };
