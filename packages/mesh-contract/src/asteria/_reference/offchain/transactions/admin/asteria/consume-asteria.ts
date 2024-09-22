import {
  Data,
  toUnit,
  TxHash,
  Constr,
  UTxO,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";
import { fetchReferenceScript, lucidBase } from "../../../utils.ts";
import { AssetClassT } from "../../../types.ts";

async function consumeAsteria(
  admin_token: AssetClassT,
  asteria_tx_hash: TxHash,
  asteria_tx_index: number
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

  const asteria: UTxO = (
    await lucid.utxosByOutRef([
      {
        txHash: asteria_tx_hash,
        outputIndex: asteria_tx_index,
      },
    ])
  )[0];

  const adminTokenUnit = toUnit(admin_token.policy, admin_token.name);
  const adminUTxO: UTxO = await lucid.wallet
    .getUtxos()
    .then((us) => us.filter((u) => u.assets[adminTokenUnit] >= 1n))
    .then((us) => us[0]);

  const consumeRedeemer = Data.to(new Constr(2, []));
  const tx = await lucid
    .newTx()
    .readFrom([asteriaRef])
    .collectFrom([asteria], consumeRedeemer)
    .collectFrom([adminUTxO])
    .complete();

  const signedTx = await tx.sign().complete();
  return signedTx.submit();
}

export { consumeAsteria };
