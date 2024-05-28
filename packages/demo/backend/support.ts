import { post } from './';
import { UTxO } from '@meshsdk/common';

export async function createTransactionDonate(
  recipientAddress: string,
  amount: number,
  utxos: UTxO[]
) {
  return await post(`donate-mint-mesh`, { recipientAddress, amount, utxos });
}
