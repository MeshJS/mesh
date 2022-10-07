import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';
import { useEffect, useState } from 'react';

import {
  AppWallet,
  BlockfrostProvider,
  ForgeScript,
  Transaction,
} from '@martifylabs/mesh';
import type { Mint, AssetMetadata } from '@martifylabs/mesh';
import useWallet from '../../contexts/wallet';
import RunDemoButton from '../../components/pages/apis/common/runDemoButton';
import RunDemoResult from '../../components/pages/apis/common/runDemoResult';
import ConnectCipWallet from '../../components/pages/apis/common/connectCipWallet';
import { demoMnemonic } from '../../configs/demo';

const blockchainProvider = new BlockfrostProvider(
  process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
);

const GuideMultisigMintingPage: NextPage = () => {
  const sidebarItems = [{ label: 'Showcase', to: 'demo' }];

  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const { wallet, walletConnected } = useWallet();
  const [serverWallet, setServerWallet] = useState<AppWallet>({} as AppWallet);

  useEffect(() => {
    async function init() {
      const _wallet = new AppWallet({
        networkId: 0,
        fetcher: blockchainProvider,
        submitter: blockchainProvider,
        key: {
          type: 'mnemonic',
          words: demoMnemonic,
        },
      });
      setServerWallet(_wallet);
    }
    init();
  }, []);

  async function clientStartMinting() {
    const walletNetwork = await wallet.getNetworkId();
    if (walletNetwork != 0) {
      setResponseError(`Connect with a Testnet wallet.`);
      return;
    }

    setLoading(true);

    try {
      const unsignedTx = await serverSideCreateTx(
        await wallet.getChangeAddress()
      );
      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await serverSideSignTx(signedTx);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  async function serverSideCreateTx(recipientAddress) {
    const tx = new Transaction({ initiator: wallet });

    const serverWalletAddress = serverWallet.getPaymentAddress();
    const forgingScript = ForgeScript.withOneSignature(serverWalletAddress);

    const assetMetadata: AssetMetadata = {
      name: 'Mesh Token',
      image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
      mediaType: 'image/jpg',
      description: 'This NFT is minted by Mesh (https://mesh.martify.io/).',
    };
    const asset: Mint = {
      assetName: 'MeshToken',
      assetQuantity: '1',
      metadata: assetMetadata,
      label: '721',
      recipient: {
        address: recipientAddress,
      },
    };

    tx.mintAsset(forgingScript, asset);
    tx.sendLovelace(serverWalletAddress, '10000000');

    const unsignedTx = await tx.build();
    return unsignedTx;
  }

  async function serverSideSignTx(signedTx) {
    const serverWalletSignedTx = await serverWallet.signTx(signedTx, true);
    const txHash = await serverWallet.submitTx(serverWalletSignedTx);
    return txHash;
  }

  return (
    <>
      <Metatags
        title="Multi-signature Minting"
        description="Create a multi-sig transaction and mint NFTs"
      />
      <GuidesLayout
        title="Multi-signature Minting"
        desc="Create a multi-sig transaction and mint NFTs"
        sidebarItems={sidebarItems}
        image="/guides/laptop-g44c60b4ed_1280.jpg"
      >
        <p>
          In this guide, we will build a multi-signature transaction.
        </p>

        <Element name="demo">
          <h2>Showcase</h2>
          <p>
            This demo is on <code>preprod</code> network only.
          </p>

          {walletConnected ? (
            <>
              <RunDemoButton
                runDemoFn={clientStartMinting}
                loading={loading}
                response={response}
                label="Mint Mesh Token (10 tADA)"
              />
              <RunDemoResult response={response} />
            </>
          ) : (
            <ConnectCipWallet />
          )}
          <RunDemoResult response={response} label="Result" />
          <RunDemoResult response={responseError} label="Error" />
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideMultisigMintingPage;
