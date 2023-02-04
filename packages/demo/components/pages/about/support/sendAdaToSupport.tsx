import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import Input from '../../../ui/input';
import { Transaction } from '@meshsdk/core';
import { createTransactionDonate } from '../../../../backend/support';
import SvgSurprise from '../../../svgs/surpriseSvg';

export default function SendAdaToSupport() {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="gap-8 items-center py-8 px-4 mx-auto max-w-screen-xl xl:gap-16 md:grid md:grid-cols-2 sm:py-16 lg:px-6 format dark:format-invert">
        {/* <img
          className="w-full hidden sm:block"
          src="/support/grasp-g76b6d77d5_640.jpg"
          alt="support"
        /> */}
        <SvgSurprise className={`w-50 h-50 dark:fill-white fill-black`} />
        <div className="mt-4 md:mt-0">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Support Financially
          </h2>
          <p className="mb-6 font-light text-gray-500 md:text-lg dark:text-gray-400">
            Your support for this open-source SDK will go a long way. So thank
            you!
          </p>
          <SendPayment />
        </div>
      </div>
    </section>
  );
}

function SendPayment() {
  const [amount, setAmount] = useState<number>(25);
  const [done, setDone] = useState<boolean>(false);
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);

  async function makeTx() {
    setLoading(true);

    // const tx = new Transaction({ initiator: wallet }).sendLovelace(
    //   process.env.NEXT_PUBLIC_DONATE_ADA_ADDRESS!,
    //   (amount * 1000000).toString()
    // );
    // const unsignedTx = await tx.build();
    // const signedTx = await wallet.signTx(unsignedTx);
    // const txHash = await wallet.submitTx(signedTx);

    const network = await wallet.getNetworkId();

    if (network != 1) {
      setLoading(false);
      setDone(false);
      return;
    }

    const recipientAddress = await wallet.getChangeAddress();
    const utxos = await wallet.getUtxos();
    const { unsignedTx } = await createTransactionDonate(
      recipientAddress,
      amount,
      utxos
    );
    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);
    console.log('txHash', txHash);

    setLoading(false);
    setDone(true);
  }

  return (
    <div className="w-full bg-white rounded-lg shadow dark:border md:mt-0 sm:max-w-md xl:p-0 dark:bg-gray-800 dark:border-gray-700">
      <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
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
              className="w-full text-white bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800"
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
              src="/support/thank-g28bb2235f_640.png"
              alt="support"
            />
          </>
        )}
      </div>
    </div>
  );
}
