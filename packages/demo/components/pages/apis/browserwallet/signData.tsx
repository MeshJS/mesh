import { useState } from 'react';
import useWallet from '../../../../contexts/wallet';
import Codeblock from '../../../ui/codeblock';
import SectionTwoCol from '../common/sectionTwoCol';
import Card from '../../../ui/card';
import Input from '../../../ui/input';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import ConnectCipWallet from '../common/connectCipWallet';

export default function SignData() {
  const [payload, setPayload] = useState<string>('mesh');

  return (
    <SectionTwoCol
      sidebarTo="signData"
      header="Sign Data"
      leftFn={Left(payload)}
      rightFn={Right(payload, setPayload)}
    />
  );
}

function Left(payload) {
  let code = `const addresses = await wallet.getUsedAddresses();\n`;
  code += `const signature = await wallet.signData(addresses[0], '${payload}');`;

  return (
    <>
      <p>
        This endpoint utilizes the{' '}
        <a
          href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
          target="_blank"
          rel="noreferrer"
        >
          CIP-8 - Message Signing
        </a>{' '}
        to sign arbitrary data, to verify the data was signed by the owner of
        the private key.
      </p>
      <p>
        Here, we get the first wallet's address with{' '}
        <code>wallet.getUsedAddresses()</code>, alternativelly you can use
        reward addresses (<code>getRewardAddresses</code>) too. It's really up
        to you as the developer which address you want to use in your
        application.
      </p>
      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right(payload, setPayload) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const { wallet, walletConnected, hasAvailableWallets } = useWallet();

  async function runDemo() {
    setLoading(true);
    // const addresses = await wallet.getRewardAddresses();
    const addresses = await wallet.getUsedAddresses();
    console.log('addresses', addresses);
    let results = await wallet.signData(addresses[0], payload);

    setResponse(results);
    setLoading(false);
  }
  return (
    <Card>
      <Input
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        placeholder="Payload"
        label="Payload"
      />
      {hasAvailableWallets && (
        <>
          {walletConnected ? (
            <>
              <RunDemoButton
                runDemoFn={runDemo}
                loading={loading}
                response={response}
              />
              <RunDemoResult response={response} />
            </>
          ) : (
            <ConnectCipWallet />
          )}
        </>
      )}
    </Card>
  );
}
