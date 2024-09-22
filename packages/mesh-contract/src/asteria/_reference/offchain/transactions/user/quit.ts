import {
  Data,
  toUnit,
  TxHash,
  Constr,
  UTxO,
  Script,
  fromText,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";
import { fetchReferenceScript, lucidBase } from "../../utils.ts";
import { ShipDatum, ShipDatumT } from "../../types.ts";

async function quit(ship_tx_hash: TxHash): Promise<TxHash> {
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

  const pelletRefTxHash: { txHash: string } = JSON.parse(
    await Deno.readTextFile("./script-refs/pellet-ref.json")
  );
  const pelletRef = await fetchReferenceScript(lucid, pelletRefTxHash.txHash);
  const pelletValidator = pelletRef.scriptRef as Script;
  const fuelPolicyId = lucid.utils.mintingPolicyToId(pelletValidator);
  const fuelTokenUnit = toUnit(fuelPolicyId, fromText("FUEL"));

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
  const shipDatum = Data.from<ShipDatumT>(
    ship.datum as string,
    ShipDatum as unknown as ShipDatumT
  );
  const shipFuel = ship.assets[fuelTokenUnit];

  const shipyardPolicyId = lucid.utils.mintingPolicyToId(spacetimeValidator);
  const shipTokenUnit = toUnit(shipyardPolicyId, shipDatum.ship_token_name);
  const pilotTokenUnit = toUnit(shipyardPolicyId, shipDatum.pilot_token_name);

  const quitRedeemer = Data.to(new Constr(1, [new Constr(3, [])]));
  const burnShipRedeemer = Data.to(new Constr(1, []));
  const burnFuelRedeemer = Data.to(new Constr(1, []));
  const tx = await lucid
    .newTx()
    .mintAssets(
      {
        [shipTokenUnit]: BigInt(-1),
      },
      burnShipRedeemer
    )
    .mintAssets(
      {
        [fuelTokenUnit]: -shipFuel,
      },
      burnFuelRedeemer
    )
    .collectFrom([ship], quitRedeemer)
    .readFrom([spacetimeRef, pelletRef])
    .payToAddress(await lucid.wallet.address(), {
      [pilotTokenUnit]: BigInt(1),
    })
    .complete();

  const signedTx = await tx.sign().complete();
  return signedTx.submit();
}

export { quit };
