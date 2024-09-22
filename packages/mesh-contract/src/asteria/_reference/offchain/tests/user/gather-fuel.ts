import { admin_token } from "../../constants.ts";
import { gatherFuel } from "../../transactions/user/gather-fuel.ts";
import { printTxURL } from "../../utils.ts";

const gather_amount = 20n;
const ship_tx_hash =
  "707cae59afc77d21bacf5064b75c698648e7f510dba900260b3630f8629a87ed";
const pellet_tx_hash =
  "59cd679ce5f4e340754de739002f1971bb83358db7b2b380cef808e2dac37525";
const pellet_tx_index = 0;
const tx_earliest_posix_time = 1716500380n * 1000n;

const txHash = await gatherFuel(
  admin_token,
  gather_amount,
  ship_tx_hash,
  pellet_tx_hash,
  pellet_tx_index,
  tx_earliest_posix_time
);

printTxURL(txHash);
