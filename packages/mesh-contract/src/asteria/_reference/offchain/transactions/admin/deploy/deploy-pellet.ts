import { Data, TxHash } from "https://deno.land/x/lucid@0.10.7/mod.ts";
import { lucidBase, writeJson } from "../../../utils.ts";
import { AssetClassT } from "../../../types.ts";
import { buildPelletValidator } from "../../../scripts/pellet.ts";
import { buildDeployValidator } from "../../../scripts/deploy.ts";

async function deployPellet(admin_token: AssetClassT): Promise<TxHash> {
  const lucid = await lucidBase();
  const seed = Deno.env.get("SEED");
  if (!seed) {
    throw Error("Unable to read wallet's seed from env");
  }
  lucid.selectWalletFromSeed(seed);

  const pelletValidator = buildPelletValidator(admin_token);
  const deployValidator = buildDeployValidator(admin_token);
  const deployAddressBech32 = lucid.utils.validatorToAddress(deployValidator);

  const tx = await lucid
    .newTx()
    .payToContract(
      deployAddressBech32,
      { inline: Data.void(), scriptRef: pelletValidator },
      {}
    )
    .complete();

  const signedTx = await tx.sign().complete();
  const txHash = await signedTx.submit();

  console.log(writeJson("./script-refs/pellet-ref.json", { txHash: txHash }));
  return txHash;
}

export { deployPellet };
