import { useEffect, useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import { Transaction } from '@meshsdk/core';
import { useWallet, CardanoWallet } from '@meshsdk/react';
import { demoAddresses } from '../../../../configs/demo';

export function onNextTxLeft({ listenerName }) {
  let code1 = ``;
  code1 += `${listenerName}.onNextTx((tx) => {\n`;
  code1 += `  console.log('onNextTx', tx);\n`;
  code1 += `});\n`;

  return (
    <>
      <p>Listen for transactions that are submitted to the network.</p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}

export function onNextTxRight({ listener }) {
  const { wallet, connected } = useWallet();

  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [onNextTxLogs, setonNextTxLogs] = useState<string>('');

  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const tx = new Transaction({ initiator: wallet });
      tx.sendLovelace(demoAddresses.testnet, '2000000');

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await listener.submitTx(signedTx);
      console.log('txHash', txHash);

      // setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (connected) {
      listener.onNextTx((tx) => {
        console.log(111, 'ogmiosProvider.onNextTx', tx);
        const tmp = onNextTxLogs + `${tx}\n`;
        setonNextTxLogs(tmp);
      });
    }
  }, [connected]);

  return (
    <>
      <Card>
        {connected ? (
          <>
            <RunDemoButton
              runDemoFn={runDemo}
              loading={loading}
              response={response}
              label="Create a transaction"
            />
            <h5>onNextTx Logs</h5>
            <Codeblock data={onNextTxLogs} isJson={false} />
          </>
        ) : (
          <CardanoWallet />
        )}

        {/* <RunDemoResult response={onNextTxLogs} label="onNextTx Logs"  /> */}

        <RunDemoResult response={responseError} label="Error" />
      </Card>
    </>
  );
}
