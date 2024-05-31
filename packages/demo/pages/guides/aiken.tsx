import type { NextPage } from 'next';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';

let validatorCode = ``;
validatorCode += `use aiken/hash.{Blake2b_224, Hash}\n`;
validatorCode += `use aiken/list\n`;
validatorCode += `use aiken/transaction.{ScriptContext}\n`;
validatorCode += `use aiken/transaction/credential.{VerificationKey}\n`;
validatorCode += ` \n`;
validatorCode += `type Datum {\n`;
validatorCode += `  owner: Hash<Blake2b_224, VerificationKey>,\n`;
validatorCode += `}\n`;
validatorCode += ` \n`;
validatorCode += `type Redeemer {\n`;
validatorCode += `  msg: ByteArray,\n`;
validatorCode += `}\n`;
validatorCode += ` \n`;
validatorCode += `validator {\n`;
validatorCode += `  fn hello_world(datum: Datum, redeemer: Redeemer, context: ScriptContext) -> Bool {\n`;
validatorCode += `    let must_say_hello =\n`;
validatorCode += `      redeemer.msg == "Hello, World!"\n`;
validatorCode += ` \n`;
validatorCode += `    let must_be_signed =\n`;
validatorCode += `      list.has(context.transaction.extra_signatories, datum.owner)\n`;
validatorCode += ` \n`;
validatorCode += `    must_say_hello && must_be_signed\n`;
validatorCode += `  }\n`;
validatorCode += `}\n`;

let importCode = ``;
importCode += `import {\n`;
importCode += `  resolvePlutusScriptAddress,\n`;
importCode += `  Transaction,\n`;
importCode += `  KoiosProvider,\n`;
importCode += `  resolveDataHash,\n`;
importCode += `  resolvePaymentKeyHash,\n`;
importCode += `} from "@meshsdk/core";\n`;
importCode += `import type { PlutusScript, Data } from "@meshsdk/core";\n`;
importCode += `import { CardanoWallet, useWallet } from "@meshsdk/react";\n`;
importCode += `\n`;
importCode += `import plutusScript from "../data/plutus.json";\n`;
importCode += `import cbor from "cbor";\n`;

let lockingCode = ``;
lockingCode += `const hash = resolvePaymentKeyHash((await wallet.getUsedAddresses())[0]);\n`;
lockingCode += `const datum: Data = {\n`;
lockingCode += `  alternative: 0,\n`;
lockingCode += `  fields: [hash],\n`;
lockingCode += `};\n`;
lockingCode += `\n`;
lockingCode += `const tx = new Transaction({ initiator: wallet }).sendLovelace(\n`;
lockingCode += `  {\n`;
lockingCode += `    address: scriptAddress,\n`;
lockingCode += `    datum: { value: datum },\n`;
lockingCode += `  },\n`;
lockingCode += `  "5000000"\n`;
lockingCode += `);\n`;
lockingCode += `\n`;
lockingCode += `const unsignedTx = await tx.build();\n`;
lockingCode += `const signedTx = await wallet.signTx(unsignedTx);\n`;
lockingCode += `const txHash = await wallet.submitTx(signedTx);\n`;

let utxoCode = ``;
utxoCode += `async function _getAssetUtxo({ scriptAddress, asset, datum }) {\n`;
utxoCode += `  const utxos = await koios.fetchAddressUTxOs(scriptAddress, asset);\n`;
utxoCode += `\n`;
utxoCode += `  const dataHash = resolveDataHash(datum);\n`;
utxoCode += `\n`;
utxoCode += `  let utxo = utxos.find((utxo: any) => {\n`;
utxoCode += `    return utxo.output.dataHash == dataHash;\n`;
utxoCode += `  });\n`;
utxoCode += `\n`;
utxoCode += `  return utxo;\n`;
utxoCode += `}\n`;

let unlockCode = '';
unlockCode += `const scriptAddress = resolvePlutusScriptAddress(script, 0);\n`;
unlockCode += `\n`;
unlockCode += `const address = (await wallet.getUsedAddresses())[0];\n`;
unlockCode += `const hash = resolvePaymentKeyHash(address);\n`;
unlockCode += `const datum: Data = {\n`;
unlockCode += `  alternative: 0,\n`;
unlockCode += `  fields: [hash],\n`;
unlockCode += `};\n`;
unlockCode += `\n`;
unlockCode += `const assetUtxo = await _getAssetUtxo({\n`;
unlockCode += `  scriptAddress: scriptAddress,\n`;
unlockCode += `  asset: "lovelace",\n`;
unlockCode += `  datum: datum,\n`;
unlockCode += `});\n`;
unlockCode += `\n`;
unlockCode += `const redeemer = { data: { alternative: 0, fields: ['Hello, World!'] } };\n`;
unlockCode += `\n`;
unlockCode += `// create the unlock asset transaction\n`;
unlockCode += `const tx = new Transaction({ initiator: wallet })\n`;
unlockCode += `  .redeemValue({\n`;
unlockCode += `    value: assetUtxo,\n`;
unlockCode += `    script: script,\n`;
unlockCode += `    datum: datum,\n`;
unlockCode += `    redeemer: redeemer,\n`;
unlockCode += `  })\n`;
unlockCode += `  .sendValue(address, assetUtxo)\n`;
unlockCode += `  .setRequiredSigners([address]);\n`;
unlockCode += `\n`;
unlockCode += `const unsignedTx = await tx.build();\n`;
unlockCode += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
unlockCode += `const txHash = await wallet.submitTx(signedTx);\n`;

const GuideAikenPage: NextPage = () => {
  const sidebarItems = [
    { label: 'System setup', to: 'systemsetup' },
    { label: 'Aiken contract', to: 'writing' },
    { label: 'Lock transaction', to: 'lock' },
    { label: 'Unlock transaction', to: 'unlock' },
  ];

  return (
    <>
      <Metatags
        title="Aiken Hello World"
        description="Create smart contracts with Aiken and execute transactions with Mesh."
      />
      <GuidesLayout
        title="Aiken Hello World"
        desc="Create smart contracts with Aiken and execute transactions with Mesh."
        sidebarItems={sidebarItems}
        image="/guides/arches-1866598_1280.jpg"
      >
        <p>
          Aiken is a functional programming language created for Cardano smart
          contract development. It prioritizes on-chain execution and offers a
          user-friendly approach for building secure and efficient smart
          contracts, making it a valuable choice for developers aiming to create
          robust on-chain applications.
        </p>
        <p>
          In this tutorial, we will walk you through the process of writing a
          simple smart contract in Aiken, and create 2 transactions to lock and
          unlock assets on the Cardano blockchain.
        </p>
        <p>
          You can also try the{' '}
          <a
            href="https://aiken-template.meshjs.dev"
            target="_blank"
            rel="noreferrer"
          >
            live demo
          </a>{' '}
          and here are the codes on the GitHub{' '}
          <a
            href="https://github.com/MeshJS/aiken-next-ts-template/tree/main"
            target="_blank"
            rel="noreferrer"
          >
            repository
          </a>
        </p>

        <Element name="systemsetup">
          <h2>System setup</h2>
          <p>
            This section will guide you through the process of setting up your
            system compile Aiken smart contracts. You can skip this section if
            you have already set up your system or do not wish to compile the
            contract.
          </p>
          <p>
            You can also check the installation instructions on the{' '}
            <a
              href="https://aiken-lang.org/installation-instructions"
              target="_blank"
              rel="noreferrer"
            >
              Aiken website
            </a>{' '}
            for more information.
          </p>
          <h3>Using aikup (on Linux & MacOS only)</h3>
          <p>
            If you are using Linux or MacOS, you can use the utility tool to
            download and manage Aiken's pre-compiled executables.
          </p>
          <p>
            You can install the Aiken CLI by running the following command in
            your terminal:
          </p>
          <Codeblock
            data={`$ curl -sSfL https://install.aiken-lang.org | bash\n$ aikup`}
            isJson={false}
          />

          <h3>From sources (all platforms)</h3>

          <p>
            Aiken is written in Rust, so you will need to install Rust and Cargo
            to compile the smart contract. You can install Rust by following the
            instructions on the{' '}
            <a
              href="https://www.rust-lang.org/"
              target="_blank"
              rel="noreferrer"
            >
              Rust website
            </a>
            .
          </p>
          <p>
            Next, you will need Cargo, the Rust package manager. You can install
            Cargo by following the instructions on the{' '}
            <a
              href="https://doc.rust-lang.org/stable/book/ch01-01-installation.html"
              target="_blank"
              rel="noreferrer"
            >
              Cargo website
            </a>
            .
          </p>
          <p>
            You will know you have successfully installed Rust and Cargo when
            you can run the following commands in your terminal:
          </p>
          <Codeblock
            data={`$ rustc --version\n$ cargo --version`}
            isJson={false}
          />

          <p>
            Next, you will need to install the Aiken CLI. You can install the
            Aiken CLI by running the following command in your terminal:
          </p>

          <Codeblock data={`$ cargo install aiken`} isJson={false} />

          <h3>Check your installation</h3>

          <p>
            You will know you have successfully installed the Aiken CLI when you
            can run the following command in your terminal:
          </p>
          <Codeblock data={`$ aiken -V`} isJson={false} />

          <p>
            If you face any issues, please check the installation instructions
            on the{' '}
            <a
              href="https://aiken-lang.org/installation-instructions"
              target="_blank"
              rel="noreferrer"
            >
              Aiken website
            </a>{' '}
            for more information.
          </p>
        </Element>

        <Element name="writing">
          <h2>Writing a smart contract with Aiken</h2>
          <p>
            In this section, we will walk you through the process of writing a
            simple smart contract in Aiken. We will also create 2 transactions
            to lock and unlock assets on the Cardano blockchain.
          </p>
          <p>
            You can read more about this example on the{' '}
            <a
              href="https://aiken-lang.org/example--hello-world"
              target="_blank"
              rel="noreferrer"
            >
              Aiken website
            </a>
            .
          </p>
          <h3>Create a new project</h3>
          <p>
            First, we will create a new project. Please refer to{' '}
            <a
              href="https://meshjs.dev/guides/nextjs"
              target="_blank"
              rel="noreferrer"
            >
              this guide
            </a>{' '}
            for more information on creating a new Next.js project.
          </p>

          <p>Next, we create a new Aiken project within this project folder:</p>

          <Codeblock
            data={`$ aiken meshjs/hello_world\n$ cd hello_world\n$ aiken check`}
            isJson={false}
          />
          <p>
            Remember to check your Aiken project by running `aiken check` after
            creating a new project and as you develop the contract.
          </p>

          <h3>Write the smart contract</h3>

          <p>
            Let's create file for our validator, `validators/hello_world.ak`:
          </p>

          <Codeblock data={validatorCode} isJson={false} />

          <p>
            This validator checks that the redeemer message is "Hello, World!"
            and that the transaction is signed by the owner of the datum. If
            both conditions are met, the validator returns `true`. Otherwise, it
            returns `false`.
          </p>

          <p>Let's compile the smart contract with the Aiken CLI:</p>

          <Codeblock data={`$ aiken build`} isJson={false} />

          <p>
            This command will compile the smart contract and generate the
            `plutus.json` file in the root folder. This file is a{' '}
            <a
              href="https://github.com/cardano-foundation/CIPs/pull/258"
              target="_blank"
              rel="noreferrer"
            >
              CIP-0057 Plutus blueprint
            </a>
            , blueprint describes your on-chain contract and its binary
            interface.
          </p>
        </Element>

        <Element name="lock">
          <h2>Creating locking transaction</h2>
          <h3>Preparing the frontend</h3>
          <p>
            In this section, we will prepare the frontend for our smart
            contract. We will create a simple UI that allows users to lock and
            unlock assets on the Cardano blockchain.
          </p>
          <p>Firstly, we need to install the `cbor` package:</p>
          <Codeblock data={`$ npm install cbor`} isJson={false} />

          <p>
            Then, we create a folder, `data` and copy the `plutus.json` file
            into it.
          </p>

          <p>Next, open `pages/index.tsx` and import the following packages:</p>
          <Codeblock data={importCode} isJson={false} />

          <h3>Importing the contract</h3>
          <p>We import the contract into our frontend:</p>

          <Codeblock
            data={`const script: PlutusScript = {\n  code: cbor\n    .encode(Buffer.from(plutusScript.validators[0].compiledCode, "hex"))\n    .toString("hex"),\n  version: "V2",\n};\nconst scriptAddress = resolvePlutusScriptAddress(script, 0);`}
            isJson={false}
          />

          <p>
            Here, we are using the `plutus.json` file to create the script. We
            are also using the `resolvePlutusScriptAddress` function to resolve
            the script address.
          </p>

          <p>
            If you look at it closely, we are encoding with cbor the compiled
            code of the validator. This is because the validator is encoded in a
            flat format, which is not the format expected by the cardano-cli and
            `cardano serialization library`.
          </p>

          <h3>Locking assets</h3>

          <p>
            We create the transactions to lock assets on the Cardano blockchain:
          </p>

          <Codeblock data={lockingCode} isJson={false} />

          <p>
            Here, we are creating a new transaction to lock assets on the
            Cardano blockchain. We are using the `resolvePaymentKeyHash`
            function to resolve the payment key hash of the wallet. We are also
            using the `sendLovelace` function to send lovelace to the script
            address.
          </p>

          <p>
            As the contracts requires the owner's address in the datum field, we
            are creating a new datum with the owner's address. We are then using
            the `build` function to build the transaction, the `signTx` function
            to sign the transaction, and the `submitTx` function to submit the
            transaction to the Cardano blockchain.
          </p>
        </Element>

        <Element name="unlock">
          <h2>Unlocking assets</h2>

          <p>Next, we create the transactions to unlock assets.</p>

          <p>
            First, we create a useful function to retrieve the UTXO of the
            locked assets:
          </p>

          <Codeblock data={utxoCode} isJson={false} />

          <p>
            And here are the codes to create the transactions to unlock assets:
          </p>

          <Codeblock data={unlockCode} isJson={false} />

          <p>
            Here, we are creating a new transaction to unlock assets on the
            Cardano blockchain. We are using the `resolvePlutusScriptAddress`
            function to resolve the script address. We are also using the
            `resolvePaymentKeyHash` function to resolve the payment key hash of
            the wallet.
          </p>

          <p>
            As the contracts requires the owner's address in the datum field, we
            are creating a new datum with the owner's address. We are then using
            the `_getAssetUtxo` function to retrieve the UTXO of the locked
            assets. We are then using the `redeemValue` function to redeem the
            locked assets, the `sendValue` function to send the assets to the
            owner's address, and the `setRequiredSigners` function to set the
            required signers.
          </p>
          <p>
            As the validator requires `Hello, World!` as the redeemer message,
            we are creating a new redeemer with the message `Hello, World!`. We
            are then using the `build` function to build the transaction, the
            `signTx` function to sign the transaction, and the `submitTx`
            function to submit the transaction to the Cardano blockchain.
          </p>

          <p>
            You can check the full code on{' '}
            <a
              href="https://github.com/MeshJS/aiken-next-ts-template/blob/main/pages/index.tsx"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideAikenPage;
