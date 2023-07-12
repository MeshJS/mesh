import { useState } from 'react';
import Codeblock from '../../../../ui/codeblock';
import Card from '../../../../ui/card';
import RunDemoButton from '../../../../common/runDemoButton';
import RunDemoResult from '../../../../common/runDemoResult';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../../common/connectCipWallet';
import Input from '../../../../ui/input';
import { Transaction } from '@meshsdk/core';
import { demoAddresses } from '../../../../../configs/demo';

export default function TxSetMetadata() {
  const [userInput, setUserInput] = useState<string>('Transaction message');

  return (
    <SectionTwoCol
      sidebarTo="setMetadata"
      header="Set Metadata"
      leftFn={Left({ userInput })}
      rightFn={Right({ userInput, setUserInput })}
    />
  );
}

function Left({ userInput }) {
  let code1 = `import { Transaction } from '@meshsdk/core';\n\n`;
  code1 += `const tx = new Transaction({ initiator: wallet });\n`;
  code1 += `tx.sendLovelace(\n`;
  code1 += `  '${demoAddresses.testnet}',\n`;
  code1 += `  '1000000'\n`;
  code1 += `);\n`;
  code1 += `tx.setMetadata(0, '${userInput}');\n`;

  return (
    <>
      <p>
        Cardano Transaction Metadata specifies that any transaction can include
        arbitrary metadata which is then stored immutably in the blockchain.
        Metadata take the form of text, specific structured text, numbers, hashes,
        any combination of these, etc. If the content of metadata should remain
        secret, then it is the responsibility of the sender to first encrypt it.
        There are many use cases: for example, when combined with off-chain
        infrastructure (eg physical identifiers), metadata can act as a confirmation
        or assurance of authenticity. The current protocol parameters define the 
        maximum size of metadata permitted to accompany each transaction.
      </p>
      <p>Some uses for metadata:</p>
      <ul>
        <li>
          <b>Validation and verification</b>. Checking and verifying external
          physical objects and legitimate content, for example by coupling with a
          physical identifier such as a QR-code.  This can be especially
          beneficial for low-cost supply chain tracking of fast-moving consumer goods.
        </li>
        <li>
          <b>Authentication and attribution</b>. Confirming the authenticity of
          credentials received from an educational institution or membership
          group, using the fact that metadata can serve as an immutable and always-accessible
          evidence of certification.
        </li>
        <li>
          <b>Secure record of information</b>. Saving vital information, so nobody
          one can alter it afterwards, meaning it will last as long as the Cardano blockchain
          exists.
        </li>
      </ul>
      <p>
        You can insert metadata into a transaction with{' '}
        <code>setMetadata(key, value)</code>. The <code>key</code> is a number,
        and <code>value</code> is a string.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right({ userInput, setUserInput }) {
  const [state, setState] = useState<number>(0);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const { wallet, connected } = useWallet();

  async function runDemo() {
    setState(1);
    setResponse(null);
    setResponseError(null);

    try {
      const tx = new Transaction({ initiator: wallet });
      tx.sendLovelace(demoAddresses.testnet, '1000000');
      tx.setMetadata(0, userInput);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setResponse(txHash);
      setState(2);
    } catch (error) {
      setResponseError(JSON.stringify(error));
      setState(0);
    }
  }

  return (
    <Card>
      {/* <InputTable userInput={userInput} updateField={updateField} /> */}
      <Input
        value={userInput}
        onChange={(e) => setUserInput(e.target.value)}
        placeholder="Metadata"
        label="Metadata"
      />

      {connected ? (
        <>
          <RunDemoButton
            runDemoFn={runDemo}
            loading={state == 1}
            response={response}
          />
          <RunDemoResult response={response} />
        </>
      ) : (
        <ConnectCipWallet />
      )}
      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}
