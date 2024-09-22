import {
  Data,
  toUnit,
  TxHash,
  Constr,
  UTxO,
  Script,
  fromText,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";
import { fetchReferenceScript, lucidBase } from "../../../utils.ts";
import { AssetClassT } from "../../../types.ts";

async function consumePellets(
  admin_token: AssetClassT,
  pellets_tx_hash: TxHash,
  pellets_tx_indexes: number[]
): Promise<TxHash> {
  const lucid = await lucidBase();
  const seed = Deno.env.get("SEED");
  if (!seed) {
    throw Error("Unable to read wallet's seed from env");
  }
  lucid.selectWalletFromSeed(seed);

  const pelletRefTxHash: { txHash: string } = JSON.parse(
    await Deno.readTextFile("./script-refs/pellet-ref.json")
  );
  const pelletRef = await fetchReferenceScript(lucid, pelletRefTxHash.txHash);
  const pelletValidator = pelletRef.scriptRef as Script;
  const fuelPolicyId = lucid.utils.mintingPolicyToId(pelletValidator);
  const fuelTokenUnit = toUnit(fuelPolicyId, fromText("FUEL"));

  const pellets: UTxO[] = await lucid.utxosByOutRef(
    pellets_tx_indexes.map((i) => ({
      txHash: pellets_tx_hash,
      outputIndex: i,
    }))
  );
  const totalFuel = pellets.reduce(
    (sum, pellet) => sum + pellet.assets[fuelTokenUnit],
    0n
  );

  const adminTokenUnit = toUnit(admin_token.policy, admin_token.name);
  const adminUTxO: UTxO = await lucid.wallet
    .getUtxos()
    .then((us) => us.filter((u) => u.assets[adminTokenUnit] >= 1n))
    .then((us) => us[0]);

  const consumePelletRedeemer = Data.to(new Constr(1, [new Constr(1, [])]));
  const burnFuelRedeemer = Data.to(new Constr(1, []));
  const tx = await lucid
    .newTx()
    .mintAssets(
      {
        [fuelTokenUnit]: -totalFuel,
      },
      burnFuelRedeemer
    )
    .readFrom([pelletRef])
    .collectFrom(pellets, consumePelletRedeemer)
    .collectFrom([adminUTxO])
    .complete();

  const signedTx = await tx.sign().complete();
  return signedTx.submit();
}

export { consumePellets };
