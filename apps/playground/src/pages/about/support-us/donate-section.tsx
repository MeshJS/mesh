import { useState } from "react";

import { CardanoWallet, useWallet } from "@meshsdk/react";

import { createTransactionDonate } from "~/backend/support";
import Input from "~/components/form/input";

export default function SendPayment() {
  const [amount, setAmount] = useState<string>("25");
  const [done, setDone] = useState<boolean>(false);
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);

  async function makeTx() {
    setLoading(true);

    const network = await wallet.getNetworkId();

    if (network != 1) {
      setLoading(false);
      setDone(false);
      return;
    }

    let _amount = parseInt(amount);
    if (_amount < 1) {
      setLoading(false);
      setDone(false);
      return;
    }

    const recipientAddress = await wallet.getChangeAddress();
    const utxos = await wallet.getUtxos();
    const { unsignedTx } = await createTransactionDonate(
      recipientAddress,
      _amount,
      utxos,
    );

    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);
    console.log({ txHash });

    setLoading(false);
    setDone(true);
  }

  return (
    <div className="w-full rounded-lg bg-white shadow sm:max-w-md md:mt-0 xl:p-0 dark:border dark:border-gray-700 dark:bg-gray-800">
      <div className="space-y-4 p-6 sm:p-8 md:space-y-6">
        {!done && connected ? (
          <div className="space-y-4 md:space-y-6">
            <div>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount in ADA"
                label="Amount in ADA"
                type="number"
              />
            </div>
            <button
              className="bg-primary-600 hover:bg-primary-700 focus:ring-primary-300 dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800 w-full rounded-lg px-5 py-2.5 text-center text-sm font-medium text-white focus:outline-none focus:ring-4"
              onClick={() => makeTx()}
              disabled={loading}
            >
              {loading ? <>Building transaction...</> : <>Donate ₳{amount}</>}
            </button>
          </div>
        ) : (
          !connected && (
            <>
              <CardanoWallet />
            </>
          )
        )}
        {done && (
          <>
            <img
              className="w-full"
              src="/support/thank-you.png"
              alt="support"
            />
          </>
        )}
      </div>
    </div>
  );
}
