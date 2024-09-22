import { Data } from "https://deno.land/x/lucid@0.10.7/mod.ts";

const AssetClass = Data.Object({
  policy: Data.Bytes({ maxLength: 28 }),
  name: Data.Bytes(),
});
type AssetClassT = Data.Static<typeof AssetClass>;

const Speed = Data.Object({
  distance: Data.Integer(),
  time: Data.Integer(),
});
type SpeedT = Data.Static<typeof Speed>;

const AsteriaDatum = Data.Object({
  ship_counter: Data.Integer(),
  shipyard_policy: Data.Bytes({ maxLength: 28 }),
});
type AsteriaDatumT = Data.Static<typeof AsteriaDatum>;

const PelletDatum = Data.Object({
  pos_x: Data.Integer(),
  pos_y: Data.Integer(),
  shipyard_policy: Data.Bytes({ maxLength: 28 }),
});
type PelletDatumT = Data.Static<typeof PelletDatum>;

const ShipDatum = Data.Object({
  pos_x: Data.Integer(),
  pos_y: Data.Integer(),
  ship_token_name: Data.Bytes(),
  pilot_token_name: Data.Bytes(),
  last_move_latest_time: Data.Integer(),
});
type ShipDatumT = Data.Static<typeof ShipDatum>;

export { AssetClass, AsteriaDatum, PelletDatum, ShipDatum, Speed };
export type { AssetClassT, AsteriaDatumT, PelletDatumT, ShipDatumT, SpeedT };
