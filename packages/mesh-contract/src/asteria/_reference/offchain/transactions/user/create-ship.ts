import {
  Data,
  toUnit,
  TxHash,
  Constr,
  UTxO,
  fromText,
  Script,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";
import { fetchReferenceScript, lucidBase } from "../../utils.ts";
import {
  AssetClassT,
  AsteriaDatum,
  AsteriaDatumT,
  ShipDatum,
  ShipDatumT,
} from "../../types.ts";

async function createShip(
  admin_token: AssetClassT,
  ship_mint_lovelace_fee: bigint,
  initial_fuel: bigint,
  pos_x: bigint,
  pos_y: bigint,
  tx_latest_posix_time: bigint
): Promise<TxHash> {
  const lucid = await lucidBase();
  const seed = Deno.env.get("SEED");
  if (!seed) {
    throw Error("Unable to read wallet's seed from env");
  }
  lucid.selectWalletFromSeed(seed);

  const asteriaRefTxHash: { txHash: string } = JSON.parse(
    await Deno.readTextFile("./script-refs/asteria-ref.json")
  );
  const asteriaRef = await fetchReferenceScript(lucid, asteriaRefTxHash.txHash);
  const asteriaValidator = asteriaRef.scriptRef as Script;
  const asteriaAddressBech32 = lucid.utils.validatorToAddress(asteriaValidator);

  const spacetimeRefTxHash: { txHash: string } = JSON.parse(
    await Deno.readTextFile("./script-refs/spacetime-ref.json")
  );
  const spacetimeRef = await fetchReferenceScript(
    lucid,
    spacetimeRefTxHash.txHash
  );
  const spacetimeValidator = spacetimeRef.scriptRef as Script;
  const shipyardPolicyId = lucid.utils.mintingPolicyToId(spacetimeValidator);
  const spacetimeAddressBech32 =
    lucid.utils.validatorToAddress(spacetimeValidator);

  const pelletRefTxHash: { txHash: string } = JSON.parse(
    await Deno.readTextFile("./script-refs/pellet-ref.json")
  );
  const pelletRef = await fetchReferenceScript(lucid, pelletRefTxHash.txHash);
  const pelletValidator = pelletRef.scriptRef as Script;
  const fuelPolicyId = lucid.utils.mintingPolicyToId(pelletValidator);

  const asterias: UTxO[] = await lucid.utxosAt(asteriaAddressBech32);
  if (asterias.length != 1) {
    throw Error(
      "Expected only one Asteria UTxO, but found: " + asterias.length
    );
  }
  const asteria = asterias[0];
  if (!asteria.datum) {
    throw Error("Asteria datum not found");
  }
  const asteriaInputAda = asteria.assets.lovelace;

  const asteriaInputDatum = Data.from<AsteriaDatumT>(
    asteria.datum as string,
    AsteriaDatum as unknown as AsteriaDatumT
  );

  const asteriaInfo = {
    ship_counter: asteriaInputDatum.ship_counter + 1n,
    shipyard_policy: asteriaInputDatum.shipyard_policy,
  };
  const asteriaOutputDatum = Data.to<AsteriaDatumT>(
    asteriaInfo,
    AsteriaDatum as unknown as AsteriaDatumT
  );

  const fuelTokenName = fromText("FUEL");
  const shipTokenName = fromText("SHIP" + asteriaInputDatum.ship_counter);
  const pilotTokenName = fromText("PILOT" + asteriaInputDatum.ship_counter);
  const shipInfo = {
    pos_x: pos_x,
    pos_y: pos_y,
    ship_token_name: shipTokenName,
    pilot_token_name: pilotTokenName,
    last_move_latest_time: tx_latest_posix_time,
  };
  const shipDatum = Data.to<ShipDatumT>(
    shipInfo,
    ShipDatum as unknown as ShipDatumT
  );

  const adminTokenUnit = toUnit(admin_token.policy, admin_token.name);
  const fuelTokenUnit = toUnit(fuelPolicyId, fuelTokenName);
  const shipTokenUnit = toUnit(shipyardPolicyId, shipTokenName);
  const pilotTokenUnit = toUnit(shipyardPolicyId, pilotTokenName);

  const addNewShipRedeemer = Data.to(new Constr(0, []));
  const mintFuelRedeemer = Data.to(new Constr(0, []));
  const mintShipRedeemer = Data.to(new Constr(0, []));
  const tx = await lucid
    .newTx()
    .validTo(Number(tx_latest_posix_time))
    .readFrom([asteriaRef, spacetimeRef, pelletRef])
    .mintAssets(
      {
        [shipTokenUnit]: BigInt(1),
        [pilotTokenUnit]: BigInt(1),
      },
      mintShipRedeemer
    )
    .mintAssets(
      {
        [fuelTokenUnit]: initial_fuel,
      },
      mintFuelRedeemer
    )
    .collectFrom([asteria], addNewShipRedeemer)
    .payToContract(
      spacetimeAddressBech32,
      { inline: shipDatum },
      {
        [shipTokenUnit]: BigInt(1),
        [fuelTokenUnit]: initial_fuel,
      }
    )
    .payToContract(
      asteriaAddressBech32,
      { inline: asteriaOutputDatum },
      {
        [adminTokenUnit]: BigInt(1),
        lovelace: asteriaInputAda + ship_mint_lovelace_fee,
      }
    )
    .complete();

  const signedTx = await tx.sign().complete();
  return signedTx.submit();
}

export { createShip };
