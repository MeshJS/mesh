import { useState } from "react";

import {
  Asset,
  PlutusScript,
  serializePlutusScript,
  Transaction,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset, demoPlutusAlwaysSucceedScript } from "~/data/cardano";

export default function ContractLockAssets() {
  return (
    <TwoColumnsScroll
      sidebarTo="lockAssets"
      title="Lock assets in Smart Contract"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeScript = `import { serializePlutusScript } from '@meshsdk/core';\n`;
  codeScript += `import type { PlutusScript } from '@meshsdk/core';\n\n`;
  codeScript += `const script: PlutusScript = {\n`;
  codeScript += `  code: '${demoPlutusAlwaysSucceedScript}',\n`;
  codeScript += `  version: 'V2',\n`;
  codeScript += `};\n\n`;
  codeScript += `const { address: scriptAddress } = serializePlutusScript(script);\n`;

  let code1 = ``;
  code1 += `const assets: Asset[] = [\n`;
  code1 += `  {\n`;
  code1 += `    unit: '<UNIT_HERE>',\n`;
  code1 += `    quantity: "1",\n`;
  code1 += `  },\n`;
  code1 += `];\n`;

  let code2 = ``;
  code2 += `const tx = new Transaction({ initiator: wallet });\n`;
  code2 += `tx.sendAssets(\n`;
  code2 += `  {\n`;
  code2 += `    address: scriptAddress,\n`;
  code2 += `    datum: {\n`;
  code2 += `      value: '<DATUM_HERE>',\n`;
  code2 += `    },\n`;
  code2 += `  },\n`;
  code2 += `  assets,\n`;
  code2 += `);\n`;
  code2 += `\n`;
  code2 += `const unsignedTx = await tx.build();\n`;
  code2 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code2 += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        Assets may be reserved in a smart contract by "locking" them at the
        script's address. The assets can only be subsequently unlocked when
        certain conditions are met, for example, in the case of making a
        purchase in a marketplace contract.
      </p>
      <p>
        In this demo, we will lock selected assets from your wallet in an
        <code>always succeed</code> smart contract. Even though it is called
        "always succeed" because there is no actual "validating" logic,
        unlocking the assets still requires the correct datum to be supplied.
        Also note that in practice, multiple assets (both native assets and
        lovelace) can be sent to the contract in a single transaction.
      </p>

      <p>
        First, we need to create a script and resolve the script address.
        Luckily Mesh has a handy function to "resolve" (work out) the script
        address using:{" "}
        <Link href="/apis/serializers#serializePlutusScript">
          serializePlutusScript
        </Link>{" "}
        from the script's CBOR. Here's how it's done:
      </p>
      <Codeblock data={codeScript} />

      <p>
        Next, we need to define the assets we want to lock in the smart
        contract.
      </p>

      <Codeblock data={code1} />

      <p>
        Finally, we can build the transaction and submit it to the blockchain.
        You realize here we provided the datum value in the transaction. Since
        this is an always succeed script, any datum value will work, for this
        example, we used it to allow us to seach for this transaction later.
      </p>

      <Codeblock data={code2} />

      <p>
        If the transaction is successful, you would usually want to keep a
        record of the asset's <code>unit</code> and the <code>datum</code> used
        in the transaction, as this information is useful to unlock the assets.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>(demoAsset);
  const [userInput2, setUserInput2] = useState<string>("meshsecretcode");

  async function runDemo() {
    // script
    const script: PlutusScript = {
      code: demoPlutusAlwaysSucceedScript,
      version: "V2",
    };
    const { address: scriptAddress } = serializePlutusScript(script);

    // asset
    const assets: Asset[] = [
      {
        unit: userInput,
        quantity: "1",
      },
    ];

    // transaction
    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.sendAssets(
      {
        address: scriptAddress,
        datum: {
          value: userInput2,
        },
      },
      assets,
    );

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let code = ``;
  code += `// script\n`;
  code += `const script: PlutusScript = {\n`;
  code += `  code: '${demoPlutusAlwaysSucceedScript}',\n`;
  code += `  version: "V2",\n`;
  code += `};\n`;
  code += `const scriptAddress = resolvePlutusScriptAddress(script, 0);\n`;
  code += `\n`;
  code += `// asset\n`;
  code += `const assets: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: '${userInput}',\n`;
  code += `    quantity: "1",\n`;
  code += `  },\n`;
  code += `];\n`;
  code += `\n`;
  code += `// transaction\n`;
  code += `const tx = new Transaction({ initiator: wallet });\n`;
  code += `tx.sendAssets(\n`;
  code += `  {\n`;
  code += `    address: scriptAddress,\n`;
  code += `    datum: {\n`;
  code += `      value: '${userInput2}',\n`;
  code += `    },\n`;
  code += `  },\n`;
  code += `  assets,\n`;
  code += `);\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Lock assets in Smart Contract"
      subtitle="In this demo, we will lock an asset from your wallet in an 'always succeed' smart contract."
      runCodeFunction={runDemo}
      code={code}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Asset Unit"
            label="Asset Unit"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Datum"
            label="Datum"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
