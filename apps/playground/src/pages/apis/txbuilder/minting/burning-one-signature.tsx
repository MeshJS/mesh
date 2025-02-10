import { useEffect, useState } from "react";

import { ForgeScript, resolveScriptHash, stringToHex } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset, demoAssetId } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

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
  let codeSnippet1 = `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet1 += `const address = usedAddress[0];\n`;
  codeSnippet1 += `const forgingScript = ForgeScript.withOneSignature(address);`;

  let codeSnippet2 = ``;
  codeSnippet2 += `const policyId = resolveScriptHash(forgingScript);\n`;
  codeSnippet2 += `const tokenNameHex = stringToHex("MeshToken");\n`;

  let codeSnippet3 = txbuilderCode;
  codeSnippet3 += `const unsignedTx = await txBuilder\n`;
  codeSnippet3 += `  .mint("-1", policyId, tokenNameHex)\n`;
  codeSnippet3 += `  .mintingScript(forgingScript)\n`;
  codeSnippet3 += `  .changeAddress(changeAddress)\n`;
  codeSnippet3 += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet3 += `  .complete();\n`;

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
        Then, we resolve the policy ID and hex of token name, setting set{" "}
        <code>txBuilder.mint("-1", policyId, tokenNameHex)</code>
      </p>
      <Codeblock data={codeSnippet2} />
      <p>
        Finally, we create a transaction and burn the asset with the lower level
        APIs.
      </p>
      <Codeblock data={codeSnippet3} />
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
    const tokenNameHex = stringToHex("MeshToken");

    const unsignedTx = await txBuilder
      .mint("-1", policyId, tokenNameHex)
      .mintingScript(forgingScript)
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let code = ``;
  code += `import { ForgeScript, resolveScriptHash, stringToHex } from "@meshsdk/core";\n`;
  code += `import { useWallet } from "@meshsdk/react";\n`;
  code += `\n`;
  code += `const { wallet, connected } = useWallet();\n`;
  code += `\n`;
  code += `const utxos = await wallet.getUtxos();\n`;
  code += `const changeAddress = await wallet.getChangeAddress();\n\n`;
  code += `const forgingScript = ForgeScript.withOneSignature(changeAddress);\n`;
  code += `\n`;
  code += `const policyId = resolveScriptHash(forgingScript);\n`;
  code += `const tokenNameHex = stringToHex("MeshToken");\n`;
  code += `\n`;
  code += txbuilderCode;
  code += `const unsignedTx = await txBuilder\n`;
  code += `  .mint("-1", policyId, tokenNameHex)\n`;
  code += `  .mintingScript(forgingScript)\n`;
  code += `  .changeAddress(changeAddress)\n`;
  code += `  .selectUtxosFrom(utxos)\n`;
  code += `  .complete();\n`;
  code += `\n`;
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
