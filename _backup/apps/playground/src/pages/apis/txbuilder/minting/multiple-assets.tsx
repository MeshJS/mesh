import { ForgeScript, resolveScriptHash, stringToHex } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderMintMultipleAssets() {
  return (
    <TwoColumnsScroll
      sidebarTo="mintingMultipleAssets"
      title="Minting Multiple Assets"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSnippet1 = ``;
  codeSnippet1 += `const metadata = {};\n`;
  codeSnippet1 += `metadata[policyId] = {};\n`;
  codeSnippet1 += `for (let i = 1; i < 3; i++) {\n`;
  codeSnippet1 += "  const tokenName = `MeshToken${i}`;\n";
  codeSnippet1 += `  const tokenNameHex = stringToHex(tokenName);\n`;
  codeSnippet1 += `  metadata[policyId][tokenName] = {\n`;
  codeSnippet1 += `    ...demoAssetMetadata,\n`;
  codeSnippet1 += `    name: tokenName,\n`;
  codeSnippet1 += `  };\n`;
  codeSnippet1 += `  txBuilder.mint("1", policyId, tokenNameHex);\n`;
  codeSnippet1 += `  txBuilder.mintingScript(forgingScript);\n`;
  codeSnippet1 += `}\n`;

  let codeSnippet2 = txbuilderCode;
  codeSnippet2 += `txBuilder\n`;
  codeSnippet2 += `  .metadataValue(721, metadata)\n`;
  codeSnippet2 += `  .changeAddress(changeAddress)\n`;
  codeSnippet2 += `  .selectUtxosFrom(utxos);\n`;
  codeSnippet2 += `\n`;
  codeSnippet2 += `const unsignedTx = await txBuilder.complete();\n`;
  codeSnippet2 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet2 += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        Minting multiple assets with a single transaction is a common operation
        in blockchain applications. Like minting single assets, you can mint
        multiple assets by calling <code>mint()</code> and{" "}
        <code>mintingScript</code> multiple times.
      </p>
      <Codeblock data={codeSnippet1} />
      <p>
        You appending the metadata into one object and pass it to{" "}
        <code>metadataValue()</code> method.
      </p>
      <Codeblock data={codeSnippet2} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const utxos = await wallet.getUtxos();

    const changeAddress = await wallet.getChangeAddress();
    const forgingScript = ForgeScript.withOneSignature(changeAddress);

    const policyId = resolveScriptHash(forgingScript);

    const txBuilder = getTxBuilder();

    const metadata = {};
    metadata[policyId] = {};
    for (let i = 1; i < 3; i++) {
      const tokenName = `MeshToken${i}`;
      const tokenNameHex = stringToHex(tokenName);
      metadata[policyId][tokenName] = {
        ...demoAssetMetadata,
        name: tokenName,
      };
      txBuilder.mint("1", policyId, tokenNameHex);
      txBuilder.mintingScript(forgingScript);
    }

    txBuilder
      .metadataValue(721, metadata)
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos);

    const unsignedTx = await txBuilder.complete();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = `import { MeshTxBuilder, ForgeScript, resolveScriptHash, stringToHex } from '@meshsdk/core';\n`;
  codeSnippet += `import type { Asset } from '@meshsdk/core';\n`;
  codeSnippet += `\n`;
  codeSnippet += `const { wallet, connected } = useWallet();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n`;
  codeSnippet += `const forgingScript = ForgeScript.withOneSignature(changeAddress);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const policyId = resolveScriptHash(forgingScript);\n`;
  codeSnippet += `\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `const metadata = {};\n`;
  codeSnippet += `metadata[policyId] = {};\n`;
  codeSnippet += `for (let i = 1; i < 3; i++) {\n`;
  codeSnippet += "  const tokenName = `MeshToken${i}`;\n";
  codeSnippet += `  const tokenNameHex = stringToHex(tokenName);\n`;
  codeSnippet += `  metadata[policyId][tokenName] = {\n`;
  codeSnippet += `    ...demoAssetMetadata,\n`;
  codeSnippet += `    name: tokenName,\n`;
  codeSnippet += `  };\n`;
  codeSnippet += `  txBuilder.mint("1", policyId, tokenNameHex);\n`;
  codeSnippet += `  txBuilder.mintingScript(forgingScript);\n`;
  codeSnippet += `}\n`;
  codeSnippet += `\n`;
  codeSnippet += `txBuilder\n`;
  codeSnippet += `  .metadataValue(721, metadata)\n`;
  codeSnippet += `  .changeAddress(changeAddress)\n`;
  codeSnippet += `  .selectUtxosFrom(utxos);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await txBuilder.complete();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Mint Multiple Assets"
      subtitle="Mint multiple assets with a single transaction"
      code={codeSnippet}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    ></LiveCodeDemo>
  );
}
