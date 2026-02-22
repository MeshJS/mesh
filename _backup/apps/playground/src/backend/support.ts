import type { UTxO } from "@meshsdk/core";

import { post } from "./";

export async function createTransactionDonate(
  recipientAddress: string,
  amount: number,
  utxos: UTxO[],
) {
  return await post(`donate-mint-mesh`, { recipientAddress, amount, utxos });
}
