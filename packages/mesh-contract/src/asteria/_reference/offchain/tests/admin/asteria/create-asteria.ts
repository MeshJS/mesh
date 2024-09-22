import { admin_token } from "../../../constants.ts";
import { createAsteria } from "../../../transactions/admin/asteria/create-asteria.ts";
import { printTxURL } from "../../../utils.ts";

const txHash = await createAsteria(admin_token);

printTxURL(txHash);
