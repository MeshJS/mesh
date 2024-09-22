import { fromText } from "https://deno.land/x/lucid@0.10.7/mod.ts";
import { AssetClassT, SpeedT } from "./types.ts";

const admin_token: AssetClassT = {
  policy: "516238dd0a79bac4bebe041c44bad8bf880d74720733d2fc0d255d28",
  name: fromText("asteriaAdmin"),
};
const ship_mint_lovelace_fee = 3_000_000n;
const max_asteria_mining = 50n;
const max_speed: SpeedT = {
  distance: 1n,
  time: 30n * 1000n, //milliseconds
};
const max_ship_fuel = 100n;
const fuel_per_step = 1n;
const initial_fuel = 30n;
const min_asteria_distance = 10n;

export {
  admin_token,
  ship_mint_lovelace_fee,
  max_asteria_mining,
  max_speed,
  max_ship_fuel,
  fuel_per_step,
  initial_fuel,
  min_asteria_distance,
};
