import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';
import { useEffect, useState } from 'react';

import {
  AppWallet,
  ForgeScript,
  Transaction,
  BlockfrostProvider,
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
  const sidebarItems = [
    { label: 'See it in action', to: 'demo' },
    { label: 'Connect wallet (client)', to: 'clientConnect' },
    { label: 'Build transaction (application)', to: 'applicationBuildtx' },
    { label: 'Sign transaction (client)', to: 'clientSigntx' },
  ];

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
        image="/guides/keys-g25a80b203_1280.jpg"
      >
        <IntroSection />
        <DemoSection />
        <ClientConnectWallet />
        <ApplicationBuildTx />
        <ClientSigntx />
      </GuidesLayout>
    </>
  );
};

function DemoSection() {
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const { wallet, walletConnected } = useWallet();
  const [appWallet, setAppWallet] = useState<AppWallet>({} as AppWallet);

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
      setAppWallet(_wallet);
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
      const changeAddress = await wallet.getChangeAddress(); // todo abdel look here - since we cant simply just pass change address, as it might not have the utxo needed
      const utxos = await wallet.getUtxos();
      // const changeAddress = 'addr_test1qp2k7wnshzngpqw0xmy33hvexw4aeg60yr79x3yeeqt3s2uvldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmysdp6yv3'; // await wallet.getChangeAddress();
      const appWalletSignedTx = await applicationSideCreateTx(
        changeAddress,
        utxos
      );
      const signedTx = await wallet.signTx(appWalletSignedTx, true);
      // const txHash = await applicationSideSignTx(signedTx); // todo need to mask metadata and replace it
      const txHash = await wallet.submitTx(signedTx);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  async function applicationSideCreateTx(recipientAddress, utxos) {
    console.log('utxos', utxos);

    const txOutput = [
      {
        unit: 'lovelace',
        quantity: '10000000',
      },
    ];

    const appWalletAddress = appWallet.getPaymentAddress();
    const forgingScript = ForgeScript.withOneSignature(appWalletAddress);

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

    const tx = new Transaction({ initiator: appWallet }); // todo abdel look here - this has changed from `wallet` to `appWallet` as it makes more sense for this tx to be built by appWallet
    tx.setTxInputs(utxos); // todo abdel look here - how to know which wallet to get UTXOs that contain that assets we need?
    tx.mintAsset(forgingScript, asset);
    tx.sendLovelace(appWalletAddress, '10000000');
    tx.setChangeAddress(recipientAddress);

    const unsignedTx = await tx.build();
    const appWalletSignedTx = await appWallet.signTx(unsignedTx, true);
    return appWalletSignedTx;
  }

  // async function applicationSideSignTx(signedTx) {
  //   const appWalletSignedTx = await appWallet.signTx(signedTx, true);
  //   const txHash = await appWallet.submitTx(appWalletSignedTx);
  //   return txHash;
  // }

  return (
    <Element name="demo">
      <h2>See it in action</h2>
      <p>Before we begin, let's see it in action.</p>
      <p>
        In this demo, we will connect our wallet and request for a minting
        transaction. Then, the <code>AppWallet</code> will build the
        transaction, and we will sign it with our wallet. Finally, the{' '}
        <code>AppWallet</code> will sign the transaction and submit it to the
        blockchain. Note: this demo is on <code>preprod</code> network only.
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
      <br />
      <br />
    </Element>
  );
}

function IntroSection() {
  return (
    <>
      <p>
        A multi-signature (multi-sig) transaction requires more than one user to
        sign a transaction prior to the transaction being broadcast on a
        blockchain. You can think of it like a husband and wife savings account,
        where both signatures are required to spend the funds, preventing one
        spouse from spending the money without the approval of the other. For a
        multi-sig transaction, you can include 2 or more required signers, and
        these signers can be wallets or Plutus script.
      </p>
      <p>
        In this guide, we will build a multi-sig transaction for minting. There
        are 2 wallets involved, 1) client wallet belonging to the user who
        wishes to buy a native asset, and 2) application wallet that holds the
        forging script.
      </p>
    </>
  );
}

function ClientConnectWallet() {
  let code1 = `import { BrowserWallet } from '@martifylabs/mesh';\n`;
  code1 += `const wallet = await BrowserWallet.enable(walletName);`;

  return (
    <Element name="clientConnect">
      <h2>Connect wallet (client)</h2>
      <p>
        From a web application, users can connect their wallet with{' '}
        <code>BrowserWallet</code>:
      </p>
      <Codeblock data={code1} isJson={false} />
      <p>
        Then, we can get their address with <code>getChangeAddress</code>:
      </p>
      <Codeblock
        data={`const clientChangeAddress = await wallet.getChangeAddress();`}
        isJson={false}
      />
      <p>
        This change address is required as we will send it to the application
        wallet to build the minting transaction.
      </p>
    </Element>
  );
}

function ApplicationBuildTx() {
  return (
    <Element name="applicationBuildtx">
      <h2>Build transaction (application)</h2>
      <p>
        In this guide, we won't be showing how to set up RESTful APIs and
        backend servers. There are thousands of tutorials on YouTube, we
        recommend building your backend server with{' '}
        <a
          href="https://www.youtube.com/results?search_query=nestjs"
          rel="noreferrer"
          className="link"
          target="_blank"
        >
          NestJs
        </a>
        .
      </p>
      <p></p>
    </Element>
  );
}

function ClientSigntx() {
  return (
    <Element name="clientSigntx">
      <h2>Sign transaction (client)</h2>
      <p>
        We need the client's signature to send the lovelace amount from the
        client's wallet to another wallet.
      </p>
      <Codeblock
        data={`const signedTx = await wallet.signTx(appWalletSignedTx, true);`}
        isJson={false}
      />
      <p>Submit the minting transaction:</p>
      <Codeblock
        data={`const txHash = await wallet.submitTx(signedTx);`}
        isJson={false}
      />
    </Element>
  );
}

export default GuideMultisigMintingPage;
