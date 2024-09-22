import {
  Data,
  TxHash,
  UTxO,
  toUnit,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";
import { buildDeployValidator } from "../../../scripts/deploy.ts";
import { lucidBase } from "../../../utils.ts";
import { AssetClassT } from "../../../types.ts";

async function spendRefUTxOs(admin_token: AssetClassT): Promise<TxHash> {
  const lucid = await lucidBase();
  const seed = Deno.env.get("SEED");
  if (!seed) {
    throw Error("Unable to read wallet's seed from env");
  }
  lucid.selectWalletFromSeed(seed);

  const deployValidator = buildDeployValidator(admin_token);
  const deployAddressBech32 = lucid.utils.validatorToAddress(deployValidator);
  const refUTxOs = await lucid.utxosAt(deployAddressBech32);

  if (refUTxOs.length === 0) {
    throw Error("No reference UTxOs found at deploy address.");
  }

  const adminTokenUnit = toUnit(admin_token.policy, admin_token.name);
  const adminUTxO: UTxO = await lucid.wallet
    .getUtxos()
    .then((us) => us.filter((u) => u.assets[adminTokenUnit] >= 1n))
    .then((us) => us[0]);

  const tx = await lucid
    .newTx()
    .collectFrom([adminUTxO])
    .collectFrom(refUTxOs, Data.void())
    .attachSpendingValidator(deployValidator)
    .complete();

  const signedTx = await tx.sign().complete();
  const txHash = await signedTx.submit();
  return txHash;
}

export { spendRefUTxOs };
