import { useState } from "react";

import { CardanoWallet, useWallet } from "@meshsdk/react";

import { createTransactionDonate } from "~/backend/support";
import Button from "~/components/button/button";
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
    await wallet.submitTx(signedTx);

    setLoading(false);
    setDone(true);
  }

  return (
    <div className="w-full rounded-lg bg-white shadow sm:max-w-md md:mt-0 xl:p-0 dark:border dark:border-neutral-700 dark:bg-neutral-800">
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
            <Button onClick={() => makeTx()} disabled={loading}>
              {loading ? <>Building transaction...</> : <>Donate ₳{amount}</>}
            </Button>
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
