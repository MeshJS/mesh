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
        Cardano Transaction Metadata allows anyone to embed metadata into
        transactions, which is then stored in the blockchain. Metadata be a
        text, specific structured text, number, hash, a combination of that,
        etc. If the content of metadata should remain secret, then it is the
        responsibility of the sender to encrypt it. Metadata can act as a
        confirmation or assurance of authenticity when combined with off-chain
        infrastructure such as physical identifiers. Metadata have a maximum
        length, it is limited by the current protocal on the maximum size of a
        single transaction.
      </p>
      <p>Here are some uses of metadata:</p>
      <ul>
        <li>
          <b>Validation and verification</b>. To check and verify external
          physical objects and legitimate content, for example, coupling with a
          physical identifier, such as a QR-code, but it's especially beneficial
          for low-cost supply chain tracking of fast-moving consumer goods.
        </li>
        <li>
          <b>Authentication and attribution</b>. To confirm the authenticity of
          credentials received from an educational institution or membership
          group, as metadata can serve as an immutable and always-accessible
          evidence of certification.
        </li>
        <li>
          <b>Secure record of information</b>. To save vital information, so no
          one can alter it, and it will last as long as the Cardano blockchain
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
