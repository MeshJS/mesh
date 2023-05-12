import Link from 'next/link';
import { useState } from 'react';
import { Element } from 'react-scroll';

import Codeblock from '../../../../components/ui/codeblock';
import RunDemoButton from '../../../../components/common/runDemoButton';
import RunDemoResult from '../../../../components/common/runDemoResult';
import { loadWallet } from './functions';
import { Transaction } from '@meshsdk/core';
import { demoAddresses } from '../../../../configs/demo';

export default function SendADA() {
  const [response, setResponse] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  let codeInit = ``;

  async function demoLoadWallet() {
    setLoading(true);
    setResponse(null);
    const wallet = await loadWallet();

    const tx = new Transaction({ initiator: wallet });
    tx.sendLovelace(
      // demoAddresses.testnet,
      'addr_test1qzmwuzc0qjenaljs2ytquyx8y8x02en3qxswlfcldwetaeuvldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmysm5e6yx',
      '1000000'
    );
    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    setResponse(txHash);
    console.log(tx);
    setLoading(false);
  }

  return (
    <Element name="sendada">
      <h2>Basic transaction - send ADA</h2>

      <p>
        Despite this is a basic transaction, it is not that simple. This example
        allow us to learn what it takes to build a transaction. We will use the{' '}
        <code>Transaction</code> class to build a transaction and sign it with
        our <code>solution</code> wallet. We need to define the input UTXOs and
        change address.
      </p>

      {/*       
      <Codeblock data={codeInit} isJson={false} />
      <p>
        If you do not have one, you can create a new wallet with{' '}
        <code>AppWallet.brew()</code>.
      </p>
      <Codeblock
        data={`import { AppWallet } from '@meshsdk/core';\n\nconst mnemonic = AppWallet.brew();`}
        isJson={false}
      />
      <p>
        Let's load our <code>solution</code> wallet and get its address.
      </p>
      <Codeblock
        data={`const address = wallet.getPaymentAddress();`}
        isJson={false}
      /> */}

      <RunDemoButton
        runDemoFn={demoLoadWallet}
        loading={loading}
        response={response}
        label="Build transaction and send ADA"
      />
      <RunDemoResult response={response} />
    </Element>
  );
}
