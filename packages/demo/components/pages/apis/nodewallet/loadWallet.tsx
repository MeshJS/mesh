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
  ForgeScript,
} from '@martifylabs/mesh';
import type { IInitiator, Mint, AssetMetadata } from '@martifylabs/mesh';
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
  const [responseMintToken, setResponseMintToken] = useState<null | any>(null);

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

    setResponseLoadMnemonicWalletGetAddress(address);
    setLoading(false);
  }

  async function runDemoSendAda() {
    setLoading(true);

    const blockfrostProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREVIEW!,
      0
    );

    const tx = new Transaction({ initiator: wallet });
    tx.sendLovelace(demoAddresses.testnet, '1500000');
    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx, false);
    const txHash = await blockfrostProvider.submitTx(signedTx);

    setResponseSendAda(txHash);
    setLoading(false);
  }

  async function runDemoMintToken() {
    setLoading(true);

    const blockfrostProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREVIEW!,
      0
    );

    const address = wallet.getPaymentAddress();
    const forgingScript = ForgeScript.withOneSignature(address);

    const tx = new Transaction({ initiator: wallet });

    const assetMetadata1: AssetMetadata = {
      name: 'Mesh Token',
      image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
      mediaType: 'image/jpg',
      description: 'This NFT is minted by Mesh (https://mesh.martify.io/).',
    };
    const asset1: Mint = {
      assetName: 'MeshToken',
      assetQuantity: '1',
      metadata: assetMetadata1,
      label: '721',
      recipient: {
        address: demoAddresses.testnet,
      },
    };
    tx.mintAsset(forgingScript, asset1);
    tx.sendLovelace(demoAddresses.testnet, '1500000');

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx, false);
    const txHash = await blockfrostProvider.submitTx(signedTx);
    setResponseMintToken(txHash);
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

        <h3>Mint token</h3>

        <RunDemoButton
          runDemoFn={runDemoMintToken}
          loading={loading}
          response={responseMintToken}
          disabled={wallet == null}
        />
        <RunDemoResult response={responseMintToken} />
      </Card>
    </>
  );
}
