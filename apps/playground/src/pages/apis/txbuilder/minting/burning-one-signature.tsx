import { useEffect, useState } from "react";

import {
  cst,
  ForgeScript,
  resolveScriptHash,
  stringToHex,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset, demoAssetId } from "~/data/cardano";
import { getTxBuilder } from "../common";

export default function TxbuilderBurningOneSignature() {
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
  // todo docs
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
  codeSnippet2 += `  unit: assetAsset,\n`;
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
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();
    const txBuilder = getTxBuilder();

    const forgingScript = ForgeScript.withOneSignature(changeAddress);

    const policyId = resolveScriptHash(forgingScript);
    const tokenName = stringToHex("MeshToken");

    const unsignedTx = await txBuilder
      .mint("-1", policyId, tokenName)
      .mintingScript(forgingScript)
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  // todo docs
  let code = ``;

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
