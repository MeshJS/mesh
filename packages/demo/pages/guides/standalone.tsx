import type { NextPage } from 'next';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';

const GuideNextjsPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Setting up', to: 'settingup' },
    { label: 'Make a transaction', to: 'createtx' },
  ];

  let codePackage = ``;
  codePackage += `{\n`;
  codePackage += `  "type": "module",\n`;
  codePackage += `  "dependencies": {},\n`;
  codePackage += `  "scripts": {\n`;
  codePackage += `    "dev": "tsx index.ts"\n`;
  codePackage += `  }\n`;
  codePackage += `}\n`;

  let codeInstall = ``;
  codeInstall += `npm install\n`;
  codeInstall += `npm install tsx @meshsdk/core\n`;

  let codePackageUpdated = ``;
  codePackageUpdated += `{\n`;
  codePackageUpdated += `  "type": "module",\n`;
  codePackageUpdated += `  "dependencies": {\n`;
  codePackageUpdated += `    "@meshsdk/core": "^1.5.18",\n`;
  codePackageUpdated += `    "tsx": "^4.9.4"\n`;
  codePackageUpdated += `  },\n`;
  codePackageUpdated += `  "scripts": {\n`;
  codePackageUpdated += `    "dev": "tsx index.ts"\n`;
  codePackageUpdated += `  }\n`;
  codePackageUpdated += `}\n`;

  let codeTx = ``;
  codeTx += `import { BlockfrostProvider, MeshWallet, Transaction } from "@meshsdk/core";\n`;
  codeTx += `\n`;
  codeTx += `// Set up the blockchain provider with your key\n`;
  codeTx += `const blockchainProvider = new BlockfrostProvider("YOUR_KEY_HERE");\n`;
  codeTx += `\n`;
  codeTx += `// Initialize the wallet with a mnemonic key\n`;
  codeTx += `const wallet = new MeshWallet({\n`;
  codeTx += `  networkId: 0,\n`;
  codeTx += `  fetcher: blockchainProvider,\n`;
  codeTx += `  submitter: blockchainProvider,\n`;
  codeTx += `  key: {\n`;
  codeTx += `    type: "mnemonic",\n`;
  codeTx += `    words: [\n`;
  codeTx += `      "your", "mnemonic", "...", "here",\n`;
  codeTx += `    ],\n`;
  codeTx += `  },\n`;
  codeTx += `});\n`;
  codeTx += `\n`;
  codeTx += `// Create and send a transaction\n`;
  codeTx += `const tx = new Transaction({ initiator: wallet }).sendLovelace(\n`;
  codeTx += `  "addr_test1qp2k7wnshzngpqw0xmy33hvexw4aeg60yr79x3yeeqt3s2uvldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmysdp6yv3",\n`;
  codeTx += `  "1000000"\n`;
  codeTx += `);\n`;
  codeTx += `\n`;
  codeTx += `const unsignedTx = await tx.build();\n`;
  codeTx += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeTx += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <Metatags
        title="Executing a standalone script"
        description="Learn how to execute a standalone script to manage wallets and creating transactions."
        image="/guides/integrating-smart-contract.png"
      />
      <GuidesLayout
        title="Executing a standalone script"
        desc="Learn how to execute a standalone script to manage wallets and creating transactions."
        sidebarItems={sidebarItems}
        image="/guides/salt-harvesting-3060093_1280.jpg"
      >
        <p>
          If you're looking to run a javascript files to interact with the
          blockchain, you can use the tsx package to run the files directly from
          the command line.
        </p>
        <p>
          This guide will walk you through setting up a simple project using
          MeshSDK. By the end, you'll have a working environment that can create
          a wallet, build and sign transactions, and submit them to the
          blockchain.
        </p>
        <p>In this tutorial, we'll cover:</p>
        <ul>
          <li>
            Creating a package.json file to manage your project dependencies.
          </li>
          <li>Installing the necessary packages, including MeshSDK.</li>
          <li>
            Writing a TypeScript script to create a wallet and send a
            transaction.
          </li>
          <li>Running your project to see the results.</li>
        </ul>
        <p>Let's get started!</p>

        <Element name="settingup">
          <h2>Setting up</h2>

          <h3>Create a package.json file</h3>
          <p>
            First, create a new `package.json` file in the root of your project
            with the following content:
          </p>

          <Codeblock data={codePackage} isJson={false} />

          <h3>Install the necessary packages</h3>

          <p>
            Open your terminal and run these commands to install the required
            packages and MeshSDK:
          </p>
          <Codeblock data={codeInstall} isJson={false} />

          <p>
            Here's how your `package.json` file should look after installing the
            packages:
          </p>

          <Codeblock data={codePackageUpdated} isJson={false} />

          <ul>
            <li>
              @meshsdk/core: Core functionality for network interactions,
              wallets, and transactions.
            </li>
            <li>
              tsx: Allows running TypeScript files directly from the command
              line.
            </li>
          </ul>
        </Element>

        <Element name="createtx">
          <h2>Make a simple transaction</h2>

          <h3>Create the index.ts file</h3>

          <p>
            Next, create a new `index.ts` file in the root of your project and
            add the following code:
          </p>

          <Codeblock data={codeTx} isJson={false} />

          <p>Explanation:</p>
          <ul>
            <li>
              Wallet Initialization: The code sets up a new wallet using
              MeshWallet with a mnemonic key and a blockchain provider.
            </li>
            <li>
              Transaction Creation: A new transaction is created to send 1 ADA
              to a specific address. The transaction is built, signed, and
              submitted to the blockchain.
            </li>
            <li>Output: The transaction hash is logged to the console.</li>
          </ul>

          <h3>Run Your Application</h3>

          <p>
            In the code, you must replace `YOUR_KEY_HERE` with a valid
            blockfrost key, and replace the mnemonic words with your own. You
            can visit{' '}
            <a href="https://blockfrost.io/" target="_blank" rel="noreferrer">
              Blockfrost
            </a>{' '}
            to get a free API key, and generate a new mnemonic key from the{' '}
            <a
              href="https://meshjs.dev/apis/appwallet#generateWallet"
              target="_blank"
              rel="noreferrer"
            >
              Mesh website
            </a>
            .
          </p>

          <p>Finally, start your application by running this command:</p>
          <Codeblock data={`npm run dev`} isJson={false} />

          <p>
            If everything is set up correctly, you should see the transaction
            hash logged to the console. Congratulations! You've successfully
            created a wallet and sent a transaction using MeshSDK.
          </p>

          <p>
            You can find the complete code for this guide in the{' '}
            <a href="https://github.com/MeshJS/standalone-template">
              Mesh GitHub repo
            </a>
            .
          </p>
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideNextjsPage;
