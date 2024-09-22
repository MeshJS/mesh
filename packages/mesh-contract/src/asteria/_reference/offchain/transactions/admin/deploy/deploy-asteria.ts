import { Data, TxHash } from "https://deno.land/x/lucid@0.10.7/mod.ts";
import { buildAsteriaValidator } from "../../../scripts/asteria.ts";
import { lucidBase, writeJson } from "../../../utils.ts";
import { AssetClassT } from "../../../types.ts";
import { buildDeployValidator } from "../../../scripts/deploy.ts";

async function deployAsteria(
  admin_token: AssetClassT,
  ship_mint_lovelace_fee: bigint,
  max_asteria_mining: bigint
): Promise<TxHash> {
  const lucid = await lucidBase();
  const seed = Deno.env.get("SEED");
  if (!seed) {
    throw Error("Unable to read wallet's seed from env");
  }
  lucid.selectWalletFromSeed(seed);

  const asteriaValidator = buildAsteriaValidator(
    admin_token,
    ship_mint_lovelace_fee,
    max_asteria_mining
  );

  const deployValidator = buildDeployValidator(admin_token);
  const deployAddressBech32 = lucid.utils.validatorToAddress(deployValidator);

  const tx = await lucid
    .newTx()
    .payToContract(
      deployAddressBech32,
      { inline: Data.void(), scriptRef: asteriaValidator },
      {}
    )
    .complete();

  const signedTx = await tx.sign().complete();
  const txHash = await signedTx.submit();

  console.log(writeJson("./script-refs/asteria-ref.json", { txHash: txHash }));
  return txHash;
}

export { deployAsteria };
