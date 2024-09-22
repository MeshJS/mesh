import { spendRefUTxOs } from "../../../transactions/admin/deploy/spend-refs.ts";
import { admin_token } from "../../../constants.ts";
import { printTxURL } from "../../../utils.ts";

const txHash = await spendRefUTxOs(admin_token);

printTxURL(txHash);
