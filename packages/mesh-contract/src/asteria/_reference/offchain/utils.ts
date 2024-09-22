import { Lucid, Blockfrost } from "https://deno.land/x/lucid@0.10.7/mod.ts";

const lucidBase = async (): Promise<Lucid> => {
  const lucid = await Lucid.new(
    new Blockfrost(
      "https://cardano-preview.blockfrost.io/api/v0",
      Deno.env.get("BLOCKFROST_PROJECT_ID")
    ),
    "Preview"
  );
  return lucid;
};

function writeJson(path: string, data: object): string {
  try {
    Deno.writeTextFileSync(path, JSON.stringify(data));
    return "Written to " + path;
  } catch (e) {
    return e.message;
  }
}

const abs = (n: bigint) => (n < 0n ? -n : n);

export async function fetchReferenceScript(lucid: Lucid, txhash: string) {
  const ref = await lucid.utxosByOutRef([
    {
      txHash: txhash,
      outputIndex: 0,
    },
  ]);

  if (!ref[0].scriptRef) {
    throw Error("Could not read validator from ref UTxO");
  }

  return ref[0];
}

const distance = (delta_x: bigint, delta_y: bigint): bigint => {
  return abs(delta_x) + abs(delta_y);
};

const required_fuel = (distance: bigint, fuel_per_step: bigint): bigint => {
  return distance * fuel_per_step;
};

const printTxURL = (txHash: string): void => {
  console.log("https://preview.cexplorer.io/tx/" + txHash);
};

export { lucidBase, writeJson, distance, required_fuel, printTxURL };
