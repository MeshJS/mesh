import { useEffect, useState } from "react";

import { Asset, ForgeScript, Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset, demoAssetId } from "~/data/cardano";

export default function BurningOneSignature() {
  const [userInput, setUserInput] = useState<string>(demoAsset);

  return (
    <TwoColumnsScroll
      sidebarTo="burningOneSignature"
      title="Burning assets"
      leftSection={Left(userInput)}
      rightSection={Right(userInput, setUserInput)}
    />
  );
}

function Left(userInput: string) {
  let codeSnippet = `import { Transaction, ForgeScript } from '@meshsdk/core';\n`;
  codeSnippet += `import type { Asset } from '@meshsdk/core';\n\n`;

  codeSnippet += `// prepare forgingScript\n`;
  codeSnippet += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet += `const address = usedAddress[0];\n`;
  codeSnippet += `const forgingScript = ForgeScript.withOneSignature(address);\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n\n`;

  codeSnippet += `// burn asset \n`;
  codeSnippet += `const asset: Asset = {\n`;
  codeSnippet += `  unit: '${userInput}',\n`;
  codeSnippet += `  quantity: '1',\n`;
  codeSnippet += `};\n`;
  codeSnippet += `tx.burnAsset(forgingScript, asset);\n\n`;

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  let codeSnippet1 = `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet1 += `const address = usedAddress[0];\n`;
  codeSnippet1 += `const forgingScript = ForgeScript.withOneSignature(address);`;

  let codeSnippet2 = `const asset: Asset = {\n`;
  codeSnippet2 += `  unit: '${userInput}',\n`;
  codeSnippet2 += `  quantity: '1',\n`;
  codeSnippet2 += `};\n`;
  codeSnippet2 += `tx.burnAsset(forgingScript, asset);`;

  return (
    <>
      <p>
        Like minting assets, we need to define the <code>forgingScript</code>{" "}
        with <code>ForgeScript</code>. We use the first wallet address as the
        "minting address". Note that, assets can only be burned by its minting
        address.
      </p>
      <Codeblock data={codeSnippet1} />
      <p>
        Then, we define <code>Asset</code> and set <code>tx.burnAsset()</code>
      </p>
      <Codeblock data={codeSnippet2} />
      <p>Here is the full code:</p>
      <Codeblock data={codeSnippet} />
    </>
  );
}

function Right(userInput: string, setUserInput: (value: string) => void) {
  const { wallet, connected } = useWallet();

  useEffect(() => {
    async function load() {
      if (connected) {
        const assets = await wallet.getAssets();
        const _assets = assets.filter((asset) =>
          asset.unit.includes(demoAssetId),
        );
        if (_assets[0]) {
          setUserInput(_assets[0].unit);
        }
      }
    }
    load();
  }, [connected]);

  async function runDemo() {
    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];

    if (address === undefined) {
      throw "No address found";
    }

    // create forgingScript
    const forgingScript = ForgeScript.withOneSignature(address);

    const asset: Asset = {
      unit: userInput,
      quantity: "1",
    };

    // create transaction
    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.burnAsset(forgingScript, asset);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let code = ``;
  code += `const usedAddress = await wallet.getUsedAddresses();\n`;
  code += `const address = usedAddress[0];\n`;
  code += `\n`;
  code += `// create forgingScript\n`;
  code += `const forgingScript = ForgeScript.withOneSignature(address);\n`;
  code += `\n`;
  code += `const asset: Asset = {\n`;
  code += `  unit: '${userInput}',\n`;
  code += `  quantity: "1",\n`;
  code += `};\n`;
  code += `\n`;
  code += `// create transaction\n`;
  code += `const tx = new Transaction({ initiator: wallet });\n`;
  code += `tx.burnAsset(forgingScript, asset);\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Burn Native Assets"
      subtitle="Burn native assets"
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
      code={code}
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
        ]}
      />
    </LiveCodeDemo>
  );
}
