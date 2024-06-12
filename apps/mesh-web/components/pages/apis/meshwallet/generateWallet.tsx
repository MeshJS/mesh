import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { MeshWallet } from '@meshsdk/core';

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
      <Codeblock
        data={`const mnemonic = MeshWallet.brew();`}
        isJson={false}
      />
      <p>
        Once you have your mnemonic phrase, you can use it to generate your
        deterministic keys. It will typically generate a series of private keys
        and corresponding public keys, which you can use to manage your
        cryptocurrencies.
      </p>
      <p>
        You can also generate private keys directly by adding true in the brew
        function.
      </p>
      <Codeblock
        data={`const privatekey = MeshWallet.brew(true);`}
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
    const mnemonic = MeshWallet.brew();
    setResponseMnemonic(mnemonic);
    setLoading(false);
  }

  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Generate Wallet
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Generate new mnemonic phrases for your wallet
          </p>
        </div>
        <Codeblock
          data={`const mnemonic = MeshWallet.brew();`}
          isJson={false}
        />
        <RunDemoButton
          runDemoFn={runDemoGetMnemonic}
          loading={loading}
          response={responseMnemonic}
          label="Run code snippet"
        />
        <RunDemoResult response={responseMnemonic} />
      </Card>
    </>
  );
}
