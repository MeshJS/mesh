import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';

const GuideMintingNodejsPage: NextPage = () => {
  const sidebarItems = [
    { label: 'System setup', to: 'systemsetup' },
    { label: 'Project setup', to: 'projectsetup' },
    { label: 'Build minting transaction', to: 'minttx' },
  ];

  let codeTsconfig = `{\n`;
  codeTsconfig += `  ...\n`;
  codeTsconfig += `  "target": "ESNext",\n`;
  codeTsconfig += `  "module": "ESNext",\n`;
  codeTsconfig += `  "moduleResolution": "Node",\n`;
  codeTsconfig += `  "outDir": "dist",\n`;
  codeTsconfig += `  ...\n`;
  codeTsconfig += `}`;

  let codePackage = `{\n`;
  codePackage += `  ...\n`;
  codePackage += `  "type": "module",\n`;
  codePackage += `  "scripts": {\n`;
  codePackage += `    "start": "tsc && node ./dist/main.js"\n`;
  codePackage += `  }\n`;
  codePackage += `  ...\n`;
  codePackage += `}`;

  let codeMetadata = ``;
  codeMetadata += `export const metadata: { [assetName: string]: any } = {\n`;
  codeMetadata += `  MeshToken01: {\n`;
  codeMetadata += `    name: "Mesh Token 1",\n`;
  codeMetadata += `    image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",\n`;
  codeMetadata += `    mediaType: "image/jpg",\n`;
  codeMetadata += `    description: "Just a purple coin.",\n`;
  codeMetadata += `    artist: "This NFT is minted by Mesh (https://meshjs.dev/).",\n`;
  codeMetadata += `  },\n`;
  codeMetadata += `  MeshToken02: {\n`;
  codeMetadata += `    name: "Mesh Token 2",\n`;
  codeMetadata += `    image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",\n`;
  codeMetadata += `    mediaType: "image/jpg",\n`;
  codeMetadata += `    description: "This is suppose to be a gold coin.",\n`;
  codeMetadata += `    artist: "This NFT is minted by Mesh (https://meshjs.dev/).",\n`;
  codeMetadata += `  },\n`;
  codeMetadata += `  MeshToken03: {\n`;
  codeMetadata += `    name: "Mesh Token 3",\n`;
  codeMetadata += `    image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",\n`;
  codeMetadata += `    mediaType: "image/jpg",\n`;
  codeMetadata += `    description: "A coin with a M on it.",\n`;
  codeMetadata += `    artist: "This NFT is minted by Mesh (https://meshjs.dev/).",\n`;
  codeMetadata += `  },\n`;
  codeMetadata += `};`;

  let codeRecipients = ``;
  codeRecipients += `export const recipients: { [recipient: string]: string } = {\n`;
  codeRecipients += `  addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr:\n`;
  codeRecipients += `    "MeshToken01",\n`;
  codeRecipients += `  addr_test1qqlcxawu4gxarenqvdqyw0tqyjy69mrgsmfqhm6h65jwm4vvldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmyscxry4r:\n`;
  codeRecipients += `    "MeshToken02",\n`;
  codeRecipients += `  addr_test1qq5tay78z9l77vkxvrvtrv70nvjdk0fyvxmqzs57jg0vq6wk3w9pfppagj5rc4wsmlfyvc8xs7ytkumazu9xq49z94pqzl95zt:\n`;
  codeRecipients += `    "MeshToken03",\n`;
  codeRecipients += `};\n`;

  let codeImport = `import {\n`;
  codeImport += `  AppWallet,\n`;
  codeImport += `  Transaction,\n`;
  codeImport += `  ForgeScript,\n`;
  codeImport += `  BlockfrostProvider,\n`;
  codeImport += `  resolveTxHash,\n`;
  codeImport += `} from '@meshsdk/core';\n`;
  codeImport += `import type { Mint, AssetMetadata } from '@meshsdk/core';\n`;
  codeImport += `\n`;
  codeImport += `import { metadata } from './metadata.js';\n`;
  codeImport += `import { recipients } from './recipients.js';\n`;

  let codeVar = `const demoCLIKey = {\n`;
  codeVar += `  paymentSkey:\n`;
  codeVar += `    '5820aaca553a7b95b38b5d9b82a5daa7a27ac8e34f3cf27152a978f4576520dd6503',\n`;
  codeVar += `  stakeSkey:\n`;
  codeVar += `    '582097c458f19a3111c3b965220b1bef7d548fd75bc140a7f0a4f080e03cce604f0e',\n`;
  codeVar += `};\n`;
  codeVar += `const networkId = 0;\n`;
  codeVar += `const blockfrostKey = 'BLOCKFROST_KEY_HERE';\n`;

  let codeWallet = '';
  codeWallet += `const wallet = new AppWallet({\n`;
  codeWallet += `  networkId: networkId,\n`;
  codeWallet += `  fetcher: blockchainProvider,\n`;
  codeWallet += `  submitter: blockchainProvider,\n`;
  codeWallet += `  key: {\n`;
  codeWallet += `    type: 'cli',\n`;
  codeWallet += `    payment: demoCLIKey.paymentSkey,\n`;
  codeWallet += `    stake: demoCLIKey.stakeSkey,\n`;
  codeWallet += `  },\n`;
  codeWallet += `});\n\n`;
  codeWallet += `const walletAddress = wallet.getPaymentAddress();\n`;
  codeWallet += `const forgingScript = ForgeScript.withOneSignature(walletAddress);`;

  let codeTransaction = `const tx = new Transaction({ initiator: wallet });\n`;
  codeTransaction += `for (let recipient in recipients) {\n`;
  codeTransaction += `  const recipientAddress = recipient;\n`;
  codeTransaction += `  const assetName = recipients[recipient];\n`;
  codeTransaction += `  const assetMetadata: AssetMetadata = metadata[assetName];\n`;
  codeTransaction += `  const asset: Mint = {\n`;
  codeTransaction += `    assetName: assetName,\n`;
  codeTransaction += `    assetQuantity: '1',\n`;
  codeTransaction += `    metadata: assetMetadata,\n`;
  codeTransaction += `    label: '721',\n`;
  codeTransaction += `    recipient: recipientAddress\n`;
  codeTransaction += `  };\n`;
  codeTransaction += `  tx.mintAsset(forgingScript, asset);\n`;
  codeTransaction += `}\n`;

  let codeSign = `const unsignedTx = await tx.build();\n`;
  codeSign += `const signedTx = await wallet.signTx(unsignedTx, false);\n`;
  codeSign += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <Metatags
        title="Minting on Node.js"
        description="Load a CLI generated key and mint assets on Node.js"
        image="/guides/minting-application.png"
      />
      <GuidesLayout
        title="Minting on Node.js"
        desc="Load a CLI generated key and mint assets on Node.js"
        sidebarItems={sidebarItems}
        image="/guides/art-g68512aa8d_1280.jpg"
      >
        <p>
          In this guide, we will be minting some assets with{' '}
          <code>AppWallet</code> on Node.js.
        </p>
        <Element name="systemsetup">
          <h2>System setup</h2>

          <h3>1. Visual Studio Code</h3>
          <p>
            Visual Studio Code is a code editor made by Microsoft. Download and
            install{' '}
            <a
              href="https://code.visualstudio.com/"
              target="_blank"
              rel="noreferrer"
            >
              Visual Studio Code
            </a>{' '}
            for code editing.
          </p>

          <h3>2. Node.js</h3>
          <p>
            Node.js is a cross-platform JavaScript runtime environment that runs
            on the V8 engine and executes JavaScript code. Install the Long-Term
            Support (LTS) version of{' '}
            <a href="https://nodejs.org/" target="_blank" rel="noreferrer">
              Node.js
            </a>{' '}
            (as of writing v16.16.0).
          </p>
        </Element>

        <Element name="projectsetup">
          <h2>Project setup</h2>
          <p>Firstly, create a new folder, and initialize a Node.js project:</p>
          <Codeblock data={`npm init .`} isJson={false} />
          <p>
            Next, install the <code>typescript</code> and <code>Mesh</code>{' '}
            package:
          </p>
          <Codeblock
            data={`npm install --dev typescript && npm install @meshsdk/core`}
            isJson={false}
          />
          <p>
            Then, initialize Typescript which is require to compile a
            TypeScript:
          </p>
          <Codeblock data={`npx tsc --init`} isJson={false} />
          <p>
            After that, open the <code>tsconfig.json</code> file and define the
            following configurations:
          </p>
          <Codeblock data={codeTsconfig} isJson={false} />
          <p>
            Finally, open the <code>package.json</code> file add the following
            configurations:
          </p>
          <Codeblock data={codePackage} isJson={false} />
        </Element>

        <Element name="minttx">
          <h2>Build the minting transaction</h2>
          <h3>1. Create list of NFT's metadata</h3>
          <p>
            Create a file named <code>metadata.ts</code> and define the metadata
            for our NFTs:
          </p>
          <Codeblock data={codeMetadata} isJson={false} />
          <h3>2. Create a list of recipients</h3>
          <p>
            Create a file named <code>recipients.ts</code> and specify the list
            of recipients:
          </p>
          <Codeblock data={codeRecipients} isJson={false} />
          <h3>
            3. Create <code>main.ts</code> and import the packages:
          </h3>
          <p>
            Lets create a file named <code>main.ts</code> and import the
            packages we need and the files we have created:
          </p>
          <Codeblock data={codeImport} isJson={false} />
          <h3>4. Define variables</h3>
          <p>
            Next, lets define some variables we will need for minting. You
            should be using your own wallet if you want to mint a collection of
            your own. For this example, these are the variables we need:
          </p>
          <Codeblock data={codeVar} isJson={false} />
          <h3>5. Build the minting transaction</h3>
          <p>
            In this guide, we are building a minting transaction, but it could
            be any transactions.{' '}
            <Link href="/apis/transaction">Learn more about Transaction</Link>.
          </p>
          <p>
            Firstly, we need a blockchain provider, in this guide, we will
            import <code>BlockfrostProvider</code>, but you can use other
            providers as well:
          </p>
          <Codeblock
            data={`const blockchainProvider = new BlockfrostProvider(blockfrostKey);`}
            isJson={false}
          />
          <p>
            Next, lets initialize the <code>AppWallet</code> and its forging
            script. In this example, we initialize using CLI generated keys, but
            you can also load your wallet with private key and mnemonic phrases.{' '}
            <Link href="/apis/appwallet">Learn more about AppWallet</Link>.
          </p>
          <Codeblock data={codeWallet} isJson={false} />
          <p>
            Then, lets create a new <code>Transaction</code>, loop through each
            recipient, and mint an assets with <code>mintAsset</code> (
            <Link href="/apis/transaction">
              Learn more about minting transactions
            </Link>
            ):
          </p>
          <Codeblock data={codeTransaction} isJson={false} />
          <p>Finally, lets sign and submit the transaction:</p>
          <Codeblock data={codeSign} isJson={false} />
          <p>To execute the script, run the following on your Terminal:</p>
          <Codeblock data={`npm start`} isJson={false} />
          <p>
            For a successful transaction, you should get a transaction hash, you
            should have minted multiple assets in a single transaction, and sent
            them to multiple recipients.
          </p>
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideMintingNodejsPage;
