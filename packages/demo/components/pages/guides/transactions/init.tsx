import Link from 'next/link';
import { useState } from 'react';
import { Element } from 'react-scroll';

import Codeblock from '../../../../components/ui/codeblock';
import RunDemoButton from '../../../../components/common/runDemoButton';
import RunDemoResult from '../../../../components/common/runDemoResult';
import { loadWallet } from './functions';
import ShowMoreDetails from '../../../../components/common/showMoreDetails';

export default function Init() {
  const [response, setResponse] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  let codeInit = ``;
  codeInit += `import { AppWallet, KoiosProvider } from '@meshsdk/core';\n`;
  codeInit += `\n`;
  codeInit += `const blockchainProvider = new KoiosProvider('preprod');\n`;
  codeInit += `\n`;
  codeInit += `const wallet = new AppWallet({\n`;
  codeInit += `  networkId: 0,\n`;
  codeInit += `  fetcher: blockchainProvider,\n`;
  codeInit += `  submitter: blockchainProvider,\n`;
  codeInit += `  key: {\n`;
  codeInit += `    type: 'mnemonic',\n`;
  codeInit += `    words: ["solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution"],\n`;
  codeInit += `  },\n`;
  codeInit += `});`;

  let codeDemo = codeInit;
  codeDemo += `\n\n`;
  codeDemo += `const address = wallet.getPaymentAddress();\n`;
  codeDemo += `console.log(address)\n`;

  async function demoLoadWallet() {
    setLoading(true);
    setResponse(null);
    const wallet = await loadWallet();
    const address = wallet.getPaymentAddress();
    setResponse(address);
    setLoading(false);
  }

  return (
    <Element name="init">
      <h2>Initialize your App Wallet</h2>
      <p>
        <Link href="/apis/appwallet">App Wallet</Link> allows you to build and
        sign transactions to perform tasks for your application on your behalf.
      </p>
      <p>
        To get started, you'll need to initialize your App Wallet. In this
        guide, we will be using Mesh's public wallet, we call it the{' '}
        <code>solution</code> wallet.
      </p>
      <p>
        However, if you would like to use your own wallet, with Mesh SDK, you
        can initialize it by using your own mnemonic phrases, Cardano CLI
        generated keys or private keys. Here we load our <code>solution</code>{' '}
        wallet using its mnemonic phrase.
      </p>
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
      />

      <ShowMoreDetails label="Live demo">
        <>
          <Codeblock data={codeDemo} isJson={false} />

          <RunDemoButton
            runDemoFn={demoLoadWallet}
            loading={loading}
            response={response}
            label="Load solution wallet and get address"
          />
          <RunDemoResult response={response} />

          <p>If you see a wallet address, your wallet is successful loaded.</p>
        </>
      </ShowMoreDetails>
    </Element>
  );
}
