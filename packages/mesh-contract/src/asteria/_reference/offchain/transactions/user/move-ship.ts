import {
  Data,
  toUnit,
  TxHash,
  Constr,
  UTxO,
  Script,
  fromText,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";
import {
  distance,
  fetchReferenceScript,
  lucidBase,
  required_fuel,
} from "../../utils.ts";
import { ShipDatum, ShipDatumT } from "../../types.ts";

async function moveShip(
  fuel_per_step: bigint,
  delta_x: bigint,
  delta_y: bigint,
  tx_earliest_posix_time: bigint,
  tx_latest_posix_time: bigint,
  ship_tx_hash: TxHash
): Promise<TxHash> {
  const lucid = await lucidBase();
  const seed = Deno.env.get("SEED");
  if (!seed) {
    throw Error("Unable to read wallet's seed from env");
  }
  lucid.selectWalletFromSeed(seed);

  const spacetimeRefTxHash: { txHash: string } = JSON.parse(
    await Deno.readTextFile("./script-refs/spacetime-ref.json")
  );
  const spacetimeRef = await fetchReferenceScript(
    lucid,
    spacetimeRefTxHash.txHash
  );
  const spacetimeValidator = spacetimeRef.scriptRef as Script;
  const spacetimeAddressBech32 =
    lucid.utils.validatorToAddress(spacetimeValidator);

  const pelletRefTxHash: { txHash: string } = JSON.parse(
    await Deno.readTextFile("./script-refs/pellet-ref.json")
  );
  const pelletRef = await fetchReferenceScript(lucid, pelletRefTxHash.txHash);
  const pelletValidator = pelletRef.scriptRef as Script;
  const fuelPolicyId = lucid.utils.mintingPolicyToId(pelletValidator);

  const ship: UTxO = (
    await lucid.utxosByOutRef([
      {
        txHash: ship_tx_hash,
        outputIndex: 0,
      },
    ])
  )[0];
  if (!ship.datum) {
    throw Error("Ship datum not found");
  }
  const shipAda = ship.assets.lovelace;
  const shipInputDatum = Data.from<ShipDatumT>(
    ship.datum as string,
    ShipDatum as unknown as ShipDatumT
  );

  const movedDistance = distance(delta_x, delta_y);
  const spentFuel = required_fuel(movedDistance, fuel_per_step);
  const shipInfo = {
    pos_x: shipInputDatum.pos_x + delta_x,
    pos_y: shipInputDatum.pos_y + delta_y,
    ship_token_name: shipInputDatum.ship_token_name,
    pilot_token_name: shipInputDatum.pilot_token_name,
    last_move_latest_time: tx_latest_posix_time,
  };
  const shipOutputDatum = Data.to<ShipDatumT>(
    shipInfo,
    ShipDatum as unknown as ShipDatumT
  );

  const shipyardPolicyId = lucid.utils.mintingPolicyToId(spacetimeValidator);
  const shipTokenUnit = toUnit(
    shipyardPolicyId,
    shipInputDatum.ship_token_name
  );
  const pilotTokenUnit = toUnit(
    shipyardPolicyId,
    shipInputDatum.pilot_token_name
  );
  const fuelTokenUnit = toUnit(fuelPolicyId, fromText("FUEL"));
  const shipFuel = ship.assets[fuelTokenUnit];

  const moveShipRedeemer = Data.to(
    new Constr(1, [new Constr(0, [delta_x, delta_y])])
  );
  const burnFuelRedeemer = Data.to(new Constr(1, []));
  const tx = await lucid
    .newTx()
    .validFrom(Number(tx_earliest_posix_time))
    .validTo(Number(tx_latest_posix_time))
    .collectFrom([ship], moveShipRedeemer)
    .readFrom([spacetimeRef, pelletRef])
    .mintAssets(
      {
        [fuelTokenUnit]: -spentFuel,
      },
      burnFuelRedeemer
    )
    .payToContract(
      spacetimeAddressBech32,
      { inline: shipOutputDatum },
      {
        [shipTokenUnit]: BigInt(1),
        [fuelTokenUnit]: shipFuel - spentFuel,
        lovelace: shipAda,
      }
    )
    .payToAddress(await lucid.wallet.address(), {
      [pilotTokenUnit]: BigInt(1),
    })
    .complete();

  const signedTx = await tx.sign().complete();
  return signedTx.submit();
}

export { moveShip };
