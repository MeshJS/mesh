import {
  admin_token,
  initial_fuel,
  ship_mint_lovelace_fee,
} from "../../constants.ts";
import { createShip } from "../../transactions/user/create-ship.ts";
import { printTxURL } from "../../utils.ts";

const pos_x = -8n;
const pos_y = 3n;
const tx_latest_posix_time = 1716499990n * 1000n;

const txHash = await createShip(
  admin_token,
  ship_mint_lovelace_fee,
  initial_fuel,
  pos_x,
  pos_y,
  tx_latest_posix_time
);
printTxURL(txHash);
