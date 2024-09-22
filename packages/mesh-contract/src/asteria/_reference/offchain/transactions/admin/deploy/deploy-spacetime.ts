import { Data, TxHash } from "https://deno.land/x/lucid@0.10.7/mod.ts";
import { lucidBase, writeJson } from "../../../utils.ts";
import { AssetClassT, SpeedT } from "../../../types.ts";
import { buildSpacetimeValidator } from "../../../scripts/spacetime.ts";
import { buildDeployValidator } from "../../../scripts/deploy.ts";

async function deploySpacetime(
  admin_token: AssetClassT,
  max_speed: SpeedT,
  max_ship_fuel: bigint,
  fuel_per_step: bigint,
  initial_fuel: bigint,
  min_asteria_distance: bigint
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
  const asteriaRef = await lucid.utxosByOutRef([
    {
      txHash: asteriaRefTxHash.txHash,
      outputIndex: 0,
    },
  ]);
  const asteriaValidator = asteriaRef[0].scriptRef;
  if (!asteriaValidator) {
    throw Error("Could not read Asteria validator from ref UTxO");
  }
  const asteriaAddressBech32 = lucid.utils.validatorToAddress(asteriaValidator);
  const asteriaScriptAddress =
    lucid.utils.paymentCredentialOf(asteriaAddressBech32).hash;

  const pelletRefTxHash: { txHash: string } = JSON.parse(
    await Deno.readTextFile("./script-refs/pellet-ref.json")
  );
  const pelletRef = await lucid.utxosByOutRef([
    {
      txHash: pelletRefTxHash.txHash,
      outputIndex: 0,
    },
  ]);
  const pelletValidator = pelletRef[0].scriptRef;
  if (!pelletValidator) {
    throw Error("Could not read pellet validator from ref UTxO");
  }
  const pelletAddressBech32 = lucid.utils.validatorToAddress(pelletValidator);
  const pelletScriptAddress =
    lucid.utils.paymentCredentialOf(pelletAddressBech32).hash;

  const spacetimeValidator = buildSpacetimeValidator(
    pelletScriptAddress,
    asteriaScriptAddress,
    admin_token,
    max_speed,
    max_ship_fuel,
    fuel_per_step,
    initial_fuel,
    min_asteria_distance
  );

  const deployValidator = buildDeployValidator(admin_token);
  const deployAddressBech32 = lucid.utils.validatorToAddress(deployValidator);

  const tx = await lucid
    .newTx()
    .payToContract(
      deployAddressBech32,
      { inline: Data.void(), scriptRef: spacetimeValidator },
      {}
    )
    .complete();

  const signedTx = await tx.sign().complete();
  const txHash = await signedTx.submit();

  console.log(
    writeJson("./script-refs/spacetime-ref.json", { txHash: txHash })
  );

  return txHash;
}

export { deploySpacetime };
