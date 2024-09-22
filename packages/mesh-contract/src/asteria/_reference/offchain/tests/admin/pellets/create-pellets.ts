import { admin_token } from "../../../constants.ts";
import { createPellets } from "../../../transactions/admin/pellets/create-pellets.ts";
import { readPelletsCSV } from "./utils.ts";
import { printTxURL } from "../../../utils.ts";
import { AssetClassT } from "../../../types.ts";
import {
  Assets,
  fromText,
  toUnit,
} from "https://deno.land/x/lucid@0.10.7/mod.ts";

const tokenA: AssetClassT = {
  policy: "255d6456fa68e3d858d80e3168b0d76d57b6c4033c6234e2f0de8499",
  name: fromText("tokenA"),
};
const tokenB: AssetClassT = {
  policy: "b7341c90d38390ae3a890435559184f01fac24f79df06fd5c02f7fe4",
  name: fromText("tokenB"),
};
const tokenAUnit = toUnit(tokenA.policy, tokenA.name);
const tokenBUnit = toUnit(tokenB.policy, tokenB.name);
const prize_tokens: Assets = {
  [tokenAUnit]: 1n,
  [tokenBUnit]: 2n,
};

const params = await readPelletsCSV("tests/admin/pellets/pellets.csv");
const txHash = await createPellets(prize_tokens, admin_token, params);
printTxURL(txHash);
