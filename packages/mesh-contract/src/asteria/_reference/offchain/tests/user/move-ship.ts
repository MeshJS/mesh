import { fuel_per_step } from "../../constants.ts";
import { moveShip } from "../../transactions/user/move-ship.ts";
import { printTxURL } from "../../utils.ts";

const delta_x = 2n;
const delta_y = -3n;
const ship_tx_hash =
  "e8ac97bee6db948872ea0b3dde2e7d4b34ded38a539f4f13f90b509d15ec5ef1";
const tx_earliest_posix_time = 1716501500n * 1000n;
const tx_latest_posix_time = 1716501800n * 1000n;

const txHash = await moveShip(
  fuel_per_step,
  delta_x,
  delta_y,
  tx_earliest_posix_time,
  tx_latest_posix_time,
  ship_tx_hash
);

printTxURL(txHash);
