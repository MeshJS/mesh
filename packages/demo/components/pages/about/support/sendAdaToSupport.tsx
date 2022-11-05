import { CardanoWallet, useWallet } from '@martifylabs/mesh-react';
import { useState } from 'react';
import Input from '../../../ui/input';
import { Transaction } from '@martifylabs/mesh';

export default function SendAdaToSupport() {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="gap-8 items-center py-8 px-4 mx-auto max-w-screen-xl xl:gap-16 md:grid md:grid-cols-2 sm:py-16 lg:px-6">
        <img
          className="w-full"
          src="/support/grasp-g76b6d77d5_640.jpg"
          alt="support"
        />
        <div className="mt-4 md:mt-0">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Support Financially
          </h2>
          <p className="mb-6 font-light text-gray-500 md:text-lg dark:text-gray-400">
            Your support for this open-source SDK will go a long way. So tank you!
          </p>
          <SendPayment />
        </div>
      </div>
    </section>
  );
}

function SendPayment() {
  const { connected, wallet } = useWallet();
  const [amount, setAmount] = useState<number>(25);
  const [done, setDone] = useState<boolean>(false);

  async function makeTx() {
    const tx = new Transaction({ initiator: wallet }).sendLovelace(
      process.env.NEXT_PUBLIC_DONATE_ADA_ADDRESS!,
      (amount * 1000000).toString()
    );
    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
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
            >
              Donate ₳{amount}
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
