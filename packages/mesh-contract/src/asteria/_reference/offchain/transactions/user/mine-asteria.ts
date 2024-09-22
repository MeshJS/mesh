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
import {
  AssetClassT,
  AsteriaDatum,
  AsteriaDatumT,
  ShipDatum,
  ShipDatumT,
} from "../../types.ts";

async function mineAsteria(
  admin_token: AssetClassT,
  max_asteria_mining: bigint,
  ship_tx_hash: TxHash,
  tx_earliest_posix_time: bigint
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
  const shipyardPolicyId = lucid.utils.mintingPolicyToId(spacetimeValidator);

  const pelletRefTxHash: { txHash: string } = JSON.parse(
    await Deno.readTextFile("./script-refs/pellet-ref.json")
  );
  const pelletRef = await fetchReferenceScript(lucid, pelletRefTxHash.txHash);
  const pelletValidator = pelletRef.scriptRef as Script;
  const fuelPolicyId = lucid.utils.mintingPolicyToId(pelletValidator);
  const fuelTokenUnit = toUnit(fuelPolicyId, fromText("FUEL"));

  const asteriaRefTxHash: { txHash: string } = JSON.parse(
    await Deno.readTextFile("./script-refs/asteria-ref.json")
  );
  const asteriaRef = await fetchReferenceScript(lucid, asteriaRefTxHash.txHash);
  const asteriaValidator = asteriaRef.scriptRef as Script;
  const asteriaAddressBech32 = lucid.utils.validatorToAddress(asteriaValidator);

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
  const shipInputDatum = Data.from<ShipDatumT>(
    ship.datum as string,
    ShipDatum as unknown as ShipDatumT
  );
  const shipFuel = ship.assets[fuelTokenUnit];

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
  const rewards = asteria.assets.lovelace;
  const minedRewards = BigInt(
    Math.floor((Number(rewards) * Number(max_asteria_mining)) / 100)
  );

  const asteriaInputDatum = Data.from<AsteriaDatumT>(
    asteria.datum as string,
    AsteriaDatum as unknown as AsteriaDatumT
  );
  const asteriaInfo = {
    ship_counter: asteriaInputDatum.ship_counter,
    shipyard_policy: shipyardPolicyId,
  };
  const asteriaOutputDatum = Data.to<AsteriaDatumT>(
    asteriaInfo,
    AsteriaDatum as unknown as AsteriaDatumT
  );

  const adminTokenUnit = toUnit(admin_token.policy, admin_token.name);

  const shipTokenUnit = toUnit(
    shipyardPolicyId,
    shipInputDatum.ship_token_name
  );
  const pilotTokenUnit = toUnit(
    shipyardPolicyId,
    shipInputDatum.pilot_token_name
  );

  const shipRedeemer = Data.to(new Constr(1, [new Constr(2, [])]));
  const asteriaRedeemer = Data.to(new Constr(1, []));
  const burnShipRedeemer = Data.to(new Constr(1, []));
  const burnFuelRedeemer = Data.to(new Constr(1, []));
  const tx = await lucid
    .newTx()
    .validFrom(Number(tx_earliest_posix_time))
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
    .collectFrom([ship], shipRedeemer)
    .collectFrom([asteria], asteriaRedeemer)
    .readFrom([spacetimeRef, asteriaRef, pelletRef])
    .payToContract(
      asteriaAddressBech32,
      { inline: asteriaOutputDatum },
      {
        [adminTokenUnit]: BigInt(1),
        lovelace: rewards - minedRewards,
      }
    )
    .payToAddress(await lucid.wallet.address(), {
      [pilotTokenUnit]: BigInt(1),
      lovelace: 1_500_000n,
    })
    .complete();

  const signedTx = await tx.sign().complete();
  return signedTx.submit();
}

export { mineAsteria };
