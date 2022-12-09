import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { AppWallet } from '@meshsdk/core';

export default function GenerateWallet() {
  return (
    <SectionTwoCol
      sidebarTo="generateWallet"
      header="Generate Wallet"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        You can generate deterministic keys based on the{' '}
        <a
          href="https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki"
          target="_blank"
          rel="noreferrer"
        >
          Bitcoin BIP39
        </a>
        . These mnemonic phrases allow you to recover your wallet.
      </p>
      <p>
        Once you have your mnemonic phrase, you can use it to generate your
        deterministic keys. See <code>Load AppWallet</code> in the following
        section on loading a mnemonic phrase. It will typically generate a
        series of private keys and corresponding public keys, which you can use
        to manage your cryptocurrencies.
      </p>
      <Codeblock
        data={`import { AppWallet } from '@meshsdk/core';\n\nconst mnemonic = AppWallet.brew();`}
        isJson={false}
      />
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [responseMnemonic, setResponseMnemonic] = useState<null | any>(null);

  async function runDemoGetMnemonic() {
    setLoading(true);
    const mnemonic = AppWallet.brew();
    setResponseMnemonic(mnemonic);
    setLoading(false);
  }

  return (
    <>
      <Card>
        <RunDemoButton
          runDemoFn={runDemoGetMnemonic}
          loading={loading}
          response={responseMnemonic}
          label="Generate Mnemonic"
        />
        <RunDemoResult response={responseMnemonic} />
      </Card>
    </>
  );
}
