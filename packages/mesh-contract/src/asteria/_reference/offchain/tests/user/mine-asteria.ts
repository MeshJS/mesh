import { admin_token, max_asteria_mining } from "../../constants.ts";
import { mineAsteria } from "../../transactions/user/mine-asteria.ts";
import { printTxURL } from "../../utils.ts";

const ship_tx_hash =
  "0d5e98e1a4a354f156a97777d4edbf9612e388f47142426a56bf6100b22b9c78";
const tx_earliest_posix_time = 1716501800n * 1000n;

const txHash = await mineAsteria(
  admin_token,
  max_asteria_mining,
  ship_tx_hash,
  tx_earliest_posix_time
);
printTxURL(txHash);
