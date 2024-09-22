import { admin_token } from "../../../constants.ts";
import { consumeAsteria } from "../../../transactions/admin/asteria/consume-asteria.ts";
import { printTxURL } from "../../../utils.ts";

const asteria_tx_hash =
  "b661437c389a4bd8db770145980030af22729f9c03be442329c60389e4168c81";
const asteria_tx_index = 0;

const txHash = await consumeAsteria(
  admin_token,
  asteria_tx_hash,
  asteria_tx_index
);

printTxURL(txHash);
