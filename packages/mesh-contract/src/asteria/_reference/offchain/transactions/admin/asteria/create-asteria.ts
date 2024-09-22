import {
  Data,
  Script,
  toUnit,
  TxHash,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";
import { fetchReferenceScript, lucidBase } from "../../../utils.ts";
import { AssetClassT, AsteriaDatum, AsteriaDatumT } from "../../../types.ts";

async function createAsteria(admin_token: AssetClassT): Promise<TxHash> {
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
  const spacetimeRef = await lucid.utxosByOutRef([
    {
      txHash: spacetimeRefTxHash.txHash,
      outputIndex: 0,
    },
  ]);
  const spacetimeValidator = spacetimeRef[0].scriptRef;
  if (!spacetimeValidator) {
    throw Error("Could not read pellet validator from ref UTxO");
  }
  const shipyardPolicyId = lucid.utils.mintingPolicyToId(spacetimeValidator);

  const asteriaInfo = {
    ship_counter: 0n,
    shipyard_policy: shipyardPolicyId,
  };

  const asteriaDatum = Data.to<AsteriaDatumT>(
    asteriaInfo,
    AsteriaDatum as unknown as AsteriaDatumT
  );

  const adminTokenUnit = toUnit(admin_token.policy, admin_token.name);
  const tx = await lucid
    .newTx()
    .payToContract(
      asteriaAddressBech32,
      { inline: asteriaDatum },
      {
        [adminTokenUnit]: BigInt(1),
      }
    )
    .complete();

  const signedTx = await tx.sign().complete();
  return signedTx.submit();
}

export { createAsteria };
