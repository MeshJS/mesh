import { admin_token } from "../../../constants.ts";
import { consumePellets } from "../../../transactions/admin/pellets/consume-pellets.ts";
import { printTxURL } from "../../../utils.ts";

const pellets_tx_hash =
  "46e84d0411ae0244781f8b135636dadaf8eb129782891888fe8ca8715a272433";
const pellets_tx_indexes = Array.from({ length: 10 }, (_, i) => i + 90);
// const pellets_tx_indexes = [0, 1, 2, 3, 4];

const txHash = await consumePellets(
  admin_token,
  pellets_tx_hash,
  pellets_tx_indexes
);
printTxURL(txHash);
