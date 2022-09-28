import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../common/sectionTwoCol';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import {
  EmbeddedWallet,
  NodeWallet,
  Transaction,
  BlockfrostProvider,
} from '@martifylabs/mesh';
import type { IInitiator } from '@martifylabs/mesh';
import { demoAddresses, demoMnemonic } from '../../../../configs/demo';

export default function LoadWallet() {
  return (
    <SectionTwoCol
      sidebarTo="loadWallet"
      header="Load Wallet"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p></p>
      <Codeblock data={`a`} isJson={false} />
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [wallet, setWallet] = useState<null | IInitiator>(null);
  const [responseMnemonic, setResponseMnemonic] = useState<null | any>(null);
  const [
    responseLoadMnemonicWalletGetAddress,
    setResponseLoadMnemonicWalletGetAddress,
  ] = useState<null | any>(null);
  const [responseSendAda, setResponseSendAda] = useState<null | any>(null);

  async function runDemoGetMnemonic() {
    setLoading(true);

    const mnemonic = EmbeddedWallet.generateMnemonic();
    console.log(mnemonic);

    setResponseMnemonic(mnemonic);
    setLoading(false);
  }

  async function runDemoLoadMnemonic() {
    setLoading(true);

    const blockfrostProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREVIEW!,
      0
    );

    console.log('demoMnemonic', demoMnemonic);

    const network = 0;

    const wallet = new NodeWallet({
      networkId: network,
      fetcher: blockfrostProvider,
      key: {
        type: 'mnemonic',
        words: demoMnemonic,
      },
    });
    setWallet(wallet);

    const address = wallet.getPaymentAddress();
    console.log('address', address);

    setResponseLoadMnemonicWalletGetAddress(address);

    setLoading(false);
  }

  async function runDemoSendAda() {
    setLoading(true);

    const blockfrostProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREVIEW!,
      0
    );

    const bfUtxo = await blockfrostProvider.fetchAddressUtxos(
      wallet.getPaymentAddress()
    );
    console.log('bfUtxo', bfUtxo);

    const utxos = await wallet.getUsedUtxos();
    console.log('utxos', utxos);

    const tx = new Transaction({ initiator: wallet });
    console.log(11);
    tx.sendLovelace(demoAddresses.testnet, '1500000');
    console.log(22);
    const unsignedTx = await tx.build();
    console.log(33);
    const signedTx = await wallet.signTx(unsignedTx, false);
    console.log(44);
    const txHash = await blockfrostProvider.submitTx(signedTx);
    console.log(55, txHash);
    setResponseSendAda(txHash);

    setLoading(false);
  }

  return (
    <>
      <Card>
        <h3>Get Mnemonic</h3>

        <RunDemoButton
          runDemoFn={runDemoGetMnemonic}
          loading={loading}
          response={responseMnemonic}
        />
        <RunDemoResult response={responseMnemonic} />

        <h3>Load wallet with Mnemonic, get address</h3>

        <RunDemoButton
          runDemoFn={runDemoLoadMnemonic}
          loading={loading}
          response={responseLoadMnemonicWalletGetAddress}
        />
        <RunDemoResult response={responseLoadMnemonicWalletGetAddress} />

        <h3>Send ADA</h3>

        <RunDemoButton
          runDemoFn={runDemoSendAda}
          loading={loading}
          response={responseSendAda}
          disabled={wallet == null}
        />
        <RunDemoResult response={responseSendAda} />
      </Card>
    </>
  );
}
