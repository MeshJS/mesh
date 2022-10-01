import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../common/sectionTwoCol';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import { EmbeddedWallet } from '@martifylabs/mesh';

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
        data={`const mnemonic = EmbeddedWallet.generateMnemonic();`}
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
    const mnemonic = EmbeddedWallet.generateMnemonic();
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