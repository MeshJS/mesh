import { quit } from "../../transactions/user/quit.ts";
import { printTxURL } from "../../utils.ts";

const ship_tx_hash =
  "85568f8fc35a103b6f5753a2634631477769f3bc9ae8ea7c60dd7f7c2f342cf8";

const txHash = await quit(ship_tx_hash);

printTxURL(txHash);
