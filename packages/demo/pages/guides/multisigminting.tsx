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
  resolveMetadata,
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
        <ApplicationSigntx />
      </GuidesLayout>
    </>
  );
};

function DemoSection() {
  const browserWalletSignFirst = true;

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

  function maskValue(value: string | number) {
    if (typeof value === 'string') {
      return new Array(value.length + 1).join('#');
    } else {
      return value;
    }
  }

  function maskMetadata(metadata: AssetMetadata): AssetMetadata {
    const maskedMetadata: { [key: string]: any } = {};

    for (const key in metadata) {
      let thisValue = metadata[key];

      if (thisValue.constructor === Array) {
        maskedMetadata[key] = [];
        for (const i in thisValue) {
          let thisListValue = thisValue[i];
          maskedMetadata[key].push(maskValue(thisListValue));
        }
      } else if (typeof thisValue === 'object') {
        maskedMetadata[key] = {};
        for (const subKey in thisValue) {
          let maskedValue = maskValue(thisValue[subKey]);
          maskedMetadata[key][subKey] = maskedValue;
        }
      } else {
        maskedMetadata[key] = maskValue(thisValue);
      }
    }
    return maskedMetadata;
  }

  let policy = `d9312da562da182b02322fd8acb536f37eb9d29fba7c49dc17255527`;
  let assetName = `MeshToken`;

  const assetMetadata: AssetMetadata = {
    name: 'Mesh Token',
    image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
    mediaType: 'image/jpg',
    description: 'This NFT is minted by Mesh (https://mesh.martify.io/).',
  };
  const metadataHash = resolveMetadata({
    721: {
      [policy]: { // todo: how to resolve policy ID?
        [assetName]: assetMetadata,
      },
    },
  });
  const maskedMetadata = maskMetadata(assetMetadata);
  console.log("metadataHash", metadataHash)

  async function clientStartMinting() {
    const walletNetwork = await wallet.getNetworkId();
    if (walletNetwork != 0) {
      setResponseError(`Connect with a Testnet wallet.`);
      return;
    }

    setLoading(true);

    try {
      const changeAddress = await wallet.getChangeAddress();
      const utxos = await wallet.getUtxos();
      const unsignedTx = await applicationSideCreateTx(changeAddress, utxos);

      let signedTx = '';
      if (browserWalletSignFirst) {
        signedTx = await wallet.signTx(unsignedTx, true);
        signedTx = await applicationSideSignTx(signedTx);
      } else {
        signedTx = await applicationSideSignTx(unsignedTx);
        signedTx = await wallet.signTx(signedTx, true);
      }

      const txHash = await blockchainProvider.submitTx(signedTx);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  async function applicationSideCreateTx(recipientAddress, utxos) {
    console.log('utxos', utxos);

    const appWalletAddress = appWallet.getPaymentAddress();
    const forgingScript = ForgeScript.withOneSignature(appWalletAddress);

    const asset: Mint = {
      assetName: 'MeshToken',
      assetQuantity: '1',
      metadata: maskedMetadata,
      label: '721',
      recipient: {
        address: recipientAddress,
      },
    };

    // client utxo select utxo
    const costLovelace = '10000000';
    const selectedUtxos = largestFirst(costLovelace, utxos, true);

    const tx = new Transaction({ initiator: appWallet });
    tx.setTxInputs(selectedUtxos);
    tx.mintAsset(forgingScript, asset);
    tx.sendLovelace(bankWalletAddress, costLovelace);
    tx.setChangeAddress(recipientAddress);
    tx.setAuxiliaryDataHash(metadataHash); // todo need to set this aux data hash

    const unsignedTx = await tx.build();

    return unsignedTx;
  }

  async function applicationSideSignTx(signedTx) {
    const appWalletSignedTx = await appWallet.signTx(signedTx, true);
    console.log('assetMetadata', assetMetadata);
    console.log('maskedMetadata', maskedMetadata);
    
    // todo need to add policy and asset
    const txWithMetadata = Transaction.assignMetadata(appWalletSignedTx, {
      721: {
        [policy]: { // todo how to resolve policy on mesh?
          [assetName]: assetMetadata,
        },
      },
    });
    return txWithMetadata;
  }

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
      <p>Then, we get client's wallet address and UTXOs:</p>
      <Codeblock
        data={`const changeAddress = await wallet.getChangeAddress();\nconst utxos = await wallet.getUtxos();`}
        isJson={false}
      />
      <p>
        This change address will be the address receiving the minted NFTs and
        the transaction change. We also need to pass the client's wallet UTXOs
        for the transaction's inputs.
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

  let code2 = `const assetMetadata: AssetMetadata = {\n`;
  code2 += `  name: 'Mesh Token',\n`;
  code2 += `  image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',\n`;
  code2 += `  mediaType: 'image/jpg',\n`;
  code2 += `  description: 'This NFT is minted by Mesh (https://mesh.martify.io/).',\n`;
  code2 += `};\n`;

  let code3 = `function maskValue(value: string | number) {\n`;
  code3 += `  if (typeof value === 'string') {\n`;
  code3 += `    return new Array(value.length + 1).join('#');\n`;
  code3 += `  } else {\n`;
  code3 += `    return value;\n`;
  code3 += `  }\n`;
  code3 += `}\n`;
  code3 += `\n`;
  code3 += `function maskMetadata(metadata: AssetMetadata): AssetMetadata {\n`;
  code3 += `  const maskedMetadata: { [key: string]: any } = {};\n`;
  code3 += `\n`;
  code3 += `  for (const key in metadata) {\n`;
  code3 += `    let thisValue = metadata[key];\n`;
  code3 += `\n`;
  code3 += `    if (thisValue.constructor === Array) {\n`;
  code3 += `      maskedMetadata[key] = [];\n`;
  code3 += `      for (const i in thisValue) {\n`;
  code3 += `        let thisListValue = thisValue[i];\n`;
  code3 += `        maskedMetadata[key].push(maskValue(thisListValue));\n`;
  code3 += `      }\n`;
  code3 += `    } else if (typeof thisValue === 'object') {\n`;
  code3 += `      maskedMetadata[key] = {};\n`;
  code3 += `      for (const subKey in thisValue) {\n`;
  code3 += `        let maskedValue = maskValue(thisValue[subKey]);\n`;
  code3 += `        maskedMetadata[key][subKey] = maskedValue;\n`;
  code3 += `      }\n`;
  code3 += `    } else {\n`;
  code3 += `      maskedMetadata[key] = maskValue(thisValue);\n`;
  code3 += `    }\n`;
  code3 += `  }\n`;
  code3 += `  return maskedMetadata;\n`;
  code3 += `}\n`;
  code3 += `\n\nconst maskedMetadata = maskMetadata(assetMetadata);`;

  let code4 = `const asset: Mint = {\n`;
  code4 += `  assetName: 'MeshToken',\n`;
  code4 += `  assetQuantity: '1',\n`;
  code4 += `  metadata: maskedMetadata,\n`;
  code4 += `  label: '721',\n`;
  code4 += `  recipient: {\n`;
  code4 += `    address: recipientAddress,\n`;
  code4 += `  },\n`;
  code4 += `};\n`;

  let code5 = `const bankWalletAddress = 'addr_test1qzmwuzc0qjenaljs2ytquyx8y8x02en3qxswlfcldwetaeuvldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmysm5e6yx';\n\n`;
  code5 += `const tx = new Transaction({ initiator: appWallet });\n`;
  code5 += `tx.setTxInputs(selectedUtxos);\n`;
  code5 += `tx.mintAsset(forgingScript, asset);\n`;
  code5 += `tx.sendLovelace(bankWalletAddress, costLovelace);\n`;
  code5 += `tx.setChangeAddress(recipientAddress);\n`;
  code5 += `const unsignedTx = await tx.build();\n`;

  return (
    <Element name="applicationBuildtx">
      <h2>Build transaction (application)</h2>
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
        First, we initialize the a blockchain provider and{' '}
        <code>AppWallet</code>:
      </p>
      <Codeblock data={code1} isJson={false} />
      <p>
        Let's define the forging script, here we used the first wallet address,
        but you can also define using <code>NativeScript</code>:
      </p>
      <Codeblock
        data={`const appWalletAddress = appWallet.getPaymentAddress();\nconst forgingScript = ForgeScript.withOneSignature(appWalletAddress);`}
        isJson={false}
      />
      <p>Next, we define the NFT metadata:</p>
      <Codeblock data={code2} isJson={false} />
      <p>
        We can mask the NFT metadata so client don't see the NFT's metadata
        during signing:
      </p>
      <Codeblock data={code3} isJson={false} />
      <p>
        Then, we create the <code>Mint</code> to define the asset with the
        masked metadata:
      </p>
      <Codeblock data={code4} isJson={false} />
      <p>
        Finally, we are ready to create the transaction. Instead of setting
        every UTXOs as inputs, we can use <code>largestFirst</code> to get just
        enought UTXOs required for this transaction:
      </p>
      <Codeblock
        data={`const costLovelace = '10000000';\nconst selectedUtxos = largestFirst(costLovelace, utxos, true);`}
        isJson={false}
      />
      <p>Then, let's create the transaction.</p>
      <Codeblock data={code5} isJson={false} />
    </Element>
  );
}

function ClientSigntx() {
  return (
    <Element name="clientSigntx">
      <h2>Sign transaction (client)</h2>
      <p>We need the client's signature to send the payment:</p>
      <Codeblock
        data={`const signedTx = await wallet.signTx(unsignedTx, true);`}
        isJson={false}
      />
    </Element>
  );
}

function ApplicationSigntx() {
  let code1 = `const txWithMetadata = Transaction.assignMetadata(signedTx, {\n`;
  code1 += `  721: assetMetadata,\n`;
  code1 += `});\n`;

  let code2 = `const appWalletSignedTx = await appWallet.signTx(txWithMetadata, true);\n`;
  code2 += `const txHash = await appWallet.submitTx(appWalletSignedTx);\n`;

  return (
    <Element name="applicationSigntx">
      <h2>Sign transaction (application)</h2>
      <p>Firstly, let's update the metadata to the actual asset's metadata:</p>
      <Codeblock data={code1} isJson={false} />
      <p>
        Finally, sign the transaction with the application wallet and submit the
        transaction:
      </p>
      <Codeblock data={code2} isJson={false} />
    </Element>
  );
}

export default GuideMultisigMintingPage;
