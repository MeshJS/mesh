import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import Input from '../../../ui/input';
import { Transaction } from '@meshsdk/core';
import { useWallet, CardanoWallet } from '@meshsdk/react';
import { ArrowPathIcon, CheckIcon } from '@heroicons/react/24/solid';

export function evaluateTxLeft({ listenerName, txHash }) {
  let code1 = `const tx = new Transaction({ initiator: wallet });\n`;
  // code1 += `tx.sendLovelace('${address}', '${lovelace}');\n`;
  // code1 += `\n`;
  // code1 += `const unsignedTx = await tx.build();\n`;
  // code1 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  // code1 += `const txHash = await wallet.submitTx(signedTx);\n`;
  // code1 += `\n`;
  code1 += `${listenerName}.onTxConfirmed(txHash, () => {\n`;
  code1 += `  console.log('Transaction confirmed');\n`;
  code1 += `});\n`;

  return (
    <>
      <p>
        Allow you to listen to a transaction confirmation. Upon confirmation,
        the callback will be called.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}

export function evaluateTxRight({
  listener,
  txHash,
  setTxHash,
}) {
  const { wallet, connected } = useWallet();

  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [txWaitingConfrim, setTxWaitingConfrim] =
    useState<boolean | null>(null);

  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    setTxWaitingConfrim(null);

    try {
      const tx = new Transaction({ initiator: wallet });
      // tx.sendLovelace(address, lovelace);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);

      setResponse(txHash);

      setTxWaitingConfrim(false);
      listener.onTxConfirmed(txHash, () => {
        setTxWaitingConfrim(true);
      });
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <>
      <Card>

        {connected ? (
          <RunDemoButton
            runDemoFn={runDemo}
            loading={loading}
            response={response}
          />
        ) : (
          <CardanoWallet />
        )}

        <RunDemoResult response={response} label="Transaction hash" />
        <RunDemoResult response={responseError} label="Error" />
      </Card>
    </>
  );
}
