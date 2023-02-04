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
  largestFirst,
} from '@meshsdk/core';
import type { Mint, AssetMetadata } from '@meshsdk/core';
import { useWallet } from '@meshsdk/react';
import RunDemoButton from '../../components/common/runDemoButton';
import RunDemoResult from '../../components/common/runDemoResult';
import ConnectCipWallet from '../../components/common/connectCipWallet';
import { demoMnemonic } from '../../configs/demo';

const blockchainProvider = new BlockfrostProvider(
  process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
);
const bankWalletAddress = `addr_test1qzmwuzc0qjenaljs2ytquyx8y8x02en3qxswlfcldwetaeuvldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmysm5e6yx`;

const GuideMultisigMintingPage: NextPage = () => {
  const sidebarItems = [
    { label: 'See it in action', to: 'demo' },
    { label: 'Connect wallet (client)', to: 'clientConnect' },
    { label: 'Build transaction (application)', to: 'applicationBuildtx' },
    { label: 'Sign transaction (client)', to: 'clientSigntx' },
    { label: 'Sign transaction (application)', to: 'applicationSigntx' },
  ];

  return (
    <>
      <Metatags
        title="Multi-Signatures Transaction (Minting)"
        description="Create a multi-sig transaction and mint NFTs"
        image="/guides/multi-signatures-transaction.png"
      />
      <GuidesLayout
        title="Multi-Signatures Transaction (Minting)"
        desc="Create a multi-sig transaction and mint NFTs"
        sidebarItems={sidebarItems}
        image="/guides/keys-g25a80b203_1280.jpg"
      >
        <IntroSection />
        <DemoSection />
        <ClientConnectWallet />
        <ApplicationBuildTx />
        <ClientSigntx />
        <ApplicationSigntx />
      </GuidesLayout>
    </>
  );
};

let originalMetadata = '';

function DemoSection() {
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const { wallet, connected } = useWallet();
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

  const assetMetadata: AssetMetadata = {
    name: 'Mesh Token',
    image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
    mediaType: 'image/jpg',
    description: 'This NFT is minted by Mesh (https://meshjs.dev/).',
  };

  async function clientStartMinting() {
    const walletNetwork = await wallet.getNetworkId();
    if (walletNetwork != 0) {
      setResponseError(`Connect with a Testnet wallet.`);
      return;
    }

    setLoading(true);

    try {
      const recipientAddress = await wallet.getChangeAddress();
      const utxos = await wallet.getUtxos();
      const maskedTx = await applicationSideCreateTx(recipientAddress, utxos);

      const signedTx = await wallet.signTx(maskedTx, true);
      const txHash = await applicationSideSignTx(signedTx);

      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  async function applicationSideCreateTx(recipientAddress, utxos) {
    const appWalletAddress = appWallet.getPaymentAddress();
    const forgingScript = ForgeScript.withOneSignature(appWalletAddress);

    const asset: Mint = {
      assetName: 'MeshToken',
      assetQuantity: '1',
      metadata: assetMetadata,
      label: '721',
      recipient: recipientAddress,
    };

    // client utxo select utxo
    const costLovelace = '10000000';
    const selectedUtxos = largestFirst(costLovelace, utxos, true);

    const tx = new Transaction({ initiator: appWallet });
    tx.setTxInputs(selectedUtxos);
    tx.mintAsset(forgingScript, asset);
    tx.sendLovelace(bankWalletAddress, costLovelace);
    tx.setChangeAddress(recipientAddress);

    const unsignedTx = await tx.build();

    const _originalMetadata = Transaction.readMetadata(unsignedTx);
    originalMetadata = _originalMetadata;
    const maskedTx = Transaction.maskMetadata(unsignedTx);

    return maskedTx;
  }

  async function applicationSideSignTx(signedTx) {
    const signedOriginalTx = Transaction.writeMetadata(
      signedTx,
      originalMetadata
    );
    const appWalletSignedTx = await appWallet.signTx(signedOriginalTx, true);
    const txHash = await appWallet.submitTx(appWalletSignedTx);
    return txHash;
  }

  return (
    <Element name="demo">
      <h2>See it in action</h2>
      <p>
        In this guide, we will connect our CIP wallet (
        <Link href="/apis/browserwallet">
          <code>BrowserWallet</code>
        </Link>
        ) to request for a minting transaction. Then, the backend application
        wallet (
        <Link href="/apis/appwallet">
          <code>AppWallet</code>
        </Link>
        ) will build the transaction, and we will sign it with our wallet.
        Finally, the application wallet will sign the transaction and submit it
        to the blockchain. Note: this demo is on <code>preprod</code> network
        only.
      </p>
      <p>Let's see it in action.</p>
      {connected ? (
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
        multi-sig transaction, you can include 2 or more required signers, these
        signers can be wallets (
        <Link href="/apis/browserwallet">Browser Wallet</Link> or{' '}
        <Link href="/apis/appwallet">App Wallet</Link>) or Plutus script.
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
  let code1 = `import { BrowserWallet } from '@meshsdk/core';\n`;
  code1 += `const wallet = await BrowserWallet.enable(walletName);`;

  return (
    <Element name="clientConnect">
      <h2>Connect wallet (client)</h2>
      <p>
        In this section, we will connect client's wallet and obtain their wallet
        address and UTXO.
      </p>
      <p>
        Users can connect their wallet with{' '}
        <Link href="/apis/browserwallet">
          <code>BrowserWallet</code>
        </Link>
        :
      </p>
      <Codeblock data={code1} isJson={false} />
      <p>Then, we get client's wallet address and UTXOs:</p>
      <Codeblock
        data={`const recipientAddress = await wallet.getChangeAddress();\nconst utxos = await wallet.getUtxos();`}
        isJson={false}
      />
      <p>
        The change address will be the address receiving the minted NFTs and the
        transaction's change. Additionally, we will need the client's wallet
        UTXOs to build the minting transaction.
      </p>
    </Element>
  );
}

function ApplicationBuildTx() {
  let code1 = `const blockchainProvider = new BlockfrostProvider(\n`;
  code1 += `  '<blockfrost key here>'\n`;
  code1 += `);\n`;
  code1 += `\n`;
  code1 += `const appWallet = new AppWallet({\n`;
  code1 += `  networkId: 0,\n`;
  code1 += `  fetcher: blockchainProvider,\n`;
  code1 += `  submitter: blockchainProvider,\n`;
  code1 += `  key: {\n`;
  code1 += `    type: 'mnemonic',\n`;
  code1 += `    words: yourMnemonic,\n`;
  code1 += `  },\n`;
  code1 += `});\n`;

  let code2 = `const assetName = 'MeshToken';\n\n`;
  code2 += `const assetMetadata: AssetMetadata = {\n`;
  code2 += `  name: 'Mesh Token',\n`;
  code2 += `  image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',\n`;
  code2 += `  mediaType: 'image/jpg',\n`;
  code2 += `  description: 'This NFT is minted by Mesh (https://meshjs.dev/).',\n`;
  code2 += `};\n`;

  let code3 = ``;
  code3 += `const asset: Mint = {\n`;
  code3 += `  assetName: assetName,\n`;
  code3 += `  assetQuantity: '1',\n`;
  code3 += `  metadata: assetMetadata,\n`;
  code3 += `  label: '721',\n`;
  code3 += `  recipient: recipientAddress,\n`;
  code3 += `};\n`;

  let code4 = ``;
  code4 += `const costLovelace = '10000000';\n`;
  code4 += `const selectedUtxos = largestFirst(costLovelace, utxos, true);\n`;
  code4 += `const bankWalletAddress = 'addr_test1qzmwuzc0qjenaljs2ytquyx8y8x02en3qxswlfcldwetaeuvldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmysm5e6yx';`;

  let code5 = ``;
  code5 += `const tx = new Transaction({ initiator: appWallet });\n`;
  code5 += `tx.setTxInputs(selectedUtxos);\n`;
  code5 += `tx.mintAsset(forgingScript, asset);\n`;
  code5 += `tx.sendLovelace(bankWalletAddress, costLovelace);\n`;
  code5 += `tx.setChangeAddress(recipientAddress);\n`;
  code5 += `const unsignedTx = await tx.build();\n`;

  let code6 = `const originalMetadata = Transaction.readMetadata(unsignedTx);\n`;
  code6 += `// you want to store 'assetName' and 'originalMetadata' into the database so you can retrive it later\n`;
  code6 += `const maskedTx = Transaction.maskMetadata(unsignedTx);`;

  return (
    <Element name="applicationBuildtx">
      <h2>Build transaction (application)</h2>
      <p>In this section, we will build the minting transaction.</p>
      <p>
        In this guide, we won't be showing how to set up RESTful APIs and
        backend servers. There are thousands of tutorials on YouTube, we
        recommend building your backend server with{' '}
        <a
          href="https://vercel.com/docs/rest-api"
          rel="noreferrer"
          className="link"
          target="_blank"
        >
          Vercel API
        </a>{' '}
        or{' '}
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
      <p>
        First, we initialize the{' '}
        <Link href="/apis/providers">blockchain provider</Link> and{' '}
        <Link href="/apis/appwallet">
          <code>AppWallet</code>
        </Link>
        . In this example, we use mnemonic to restore our wallet, but you can
        initialize a wallet with mnemonic phrases, private keys, and Cardano CLI
        generated keys, see <Link href="/apis/appwallet">App Wallet</Link>.
      </p>
      <Codeblock data={code1} isJson={false} />
      <p>
        Next, let's define the forging script, here we used the first wallet
        address, but you can also define using <code>NativeScript</code>, see{' '}
        <Link href="/apis/transaction">Transaction - Minting assets</Link>:
      </p>
      <Codeblock
        data={`const appWalletAddress = appWallet.getPaymentAddress();\nconst forgingScript = ForgeScript.withOneSignature(appWalletAddress);`}
        isJson={false}
      />
      <p>
        Then, we define the <code>AssetMetadata</code> which contains the NFT
        metadata. In a NFT collection mint, you would need a selection algorithm
        and a database to select available NFTs.
      </p>
      <Codeblock data={code2} isJson={false} />
      <p>
        After that, we create the <code>Mint</code> object:
      </p>
      <Codeblock data={code3} isJson={false} />
      <p>
        Finally, we are ready to create the transaction. Instead of using every
        UTXOs from the client's wallet as transaction's inputs, we can use{' '}
        <code>largestFirst</code> to get the UTXOs required for this
        transaction. In this transaction, we send the payment to a predefined
        wallet address (<code>bankWalletAddress</code>).
      </p>
      <Codeblock data={code4} isJson={false} />
      <p>Let's create the transaction.</p>
      <Codeblock data={code5} isJson={false} />
      <p>
        Instead of sending the transaction containing the actual metadata, we
        will mask the metadata so clients do not know the content of the NFT.
        First we extract the original metadata's CBOR with{' '}
        <code>Transaction.readMetadata</code>, and execute{' '}
        <code>Transaction.maskMetadata</code> to create a masked transaction.
      </p>
      <Codeblock data={code6} isJson={false} />
      <p>
        We will send the transaction CBOR (<code>maskedTx</code>) to the client
        for signing.
      </p>
    </Element>
  );
}

function ClientSigntx() {
  return (
    <Element name="clientSigntx">
      <h2>Sign transaction (client)</h2>
      <p>
        In this section, we need the client's signature to send the payment to
        the <code>bankWalletAddress</code>. The client's wallet will open and
        prompts for payment password. Note that the partial sign is set to{' '}
        <code>true</code>.
      </p>
      <Codeblock
        data={`const signedTx = await wallet.signTx(maskedTx, true);`}
        isJson={false}
      />
      <p>
        We will send the <code>signedTx</code> to the backend to complete the
        transaction.
      </p>
    </Element>
  );
}

function ApplicationSigntx() {
  let code1 = `// here you want to retrieve the 'originalMetadata' from the database\n`;
  code1 += `const signedOriginalTx = Transaction.writeMetadata(\n`;
  code1 += `  signedTx,\n`;
  code1 += `  originalMetadata\n`;
  code1 += `);`;

  let code2 = `const appWalletSignedTx = await appWallet.signTx(signedOriginalTx, true);\n`;
  code2 += `const txHash = await appWallet.submitTx(appWalletSignedTx);`;

  return (
    <Element name="applicationSigntx">
      <h2>Sign transaction (application)</h2>
      <p>
        In this section, we will update the asset's metadata with the actual
        metadata, and the application wallet will counter sign the transaction.
      </p>
      <p>
        Let's update the metadata to the actual asset's metadata. We retrieve
        the <code>originalMetadata</code> from the database and update the
        metadata with <code>Transaction.writeMetadata</code>.
      </p>
      <Codeblock data={code1} isJson={false} />
      <p>
        Sign the transaction with the application wallet and submit the
        transaction:
      </p>
      <Codeblock data={code2} isJson={false} />
      <p>Voila! You can build any multi-sig transactions!</p>
    </Element>
  );
}

export default GuideMultisigMintingPage;
