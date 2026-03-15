import { ForgeScript, resolveScriptHash, stringToHex } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderMintAsset() {
  return (
    <TwoColumnsScroll
      sidebarTo="mintingOneSignature"
      title="Minting with One Signature"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSnippet1 = ``;
  codeSnippet1 += `const changeAddress = await wallet.getChangeAddress();\n`;
  codeSnippet1 += `const forgingScript = ForgeScript.withOneSignature(changeAddress);`;

  let codeSnippet2 = ``;
  codeSnippet2 += `const demoAssetMetadata = {\n`;
  codeSnippet2 += `  name: "Mesh Token",\n`;
  codeSnippet2 += `  image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",\n`;
  codeSnippet2 += `  mediaType: "image/jpg",\n`;
  codeSnippet2 += `  description: "This NFT was minted by Mesh (https://meshjs.dev/).",\n`;
  codeSnippet2 += `};\n`;
  codeSnippet2 += `const policyId = resolveScriptHash(forgingScript);\n`;
  codeSnippet2 += `const tokenName = "MeshToken";\n`;
  codeSnippet2 += `const tokenNameHex = stringToHex(tokenName);\n`;
  codeSnippet2 += `const metadata = { [policyId]: { [tokenName]: { ...demoAssetMetadata } } };\n`;

  let codeSnippet3 = txbuilderCode;
  codeSnippet3 += `const unsignedTx = await txBuilder\n`;
  codeSnippet3 += `  .txIn(utxo.input.txHash, utxo.input.outputIndex)\n`;
  codeSnippet3 += `  .mint("1", policyId, tokenName)\n`;
  codeSnippet3 += `  .mintingScript(forgingScript)\n`;
  codeSnippet3 += `  .changeAddress(changeAddress)\n`;
  codeSnippet3 += `  .complete();\n`;

  return (
    <>
      <p>
        In this section, we will see how to mint native assets with a{" "}
        <code>MeshTxBuilder</code>. For minting assets with smart contract,
        visit{" "}
        <Link href="/apis/txbuilder/smart-contract#plutusminting">
          MeshTxBuilder - Smart Contract - Minting Assets with Smart Contract
        </Link>
        .
      </p>
      <p>
        Firstly, we need to define the <code>forgingScript</code> with{" "}
        <code>ForgeScript</code>. We use the first wallet address as the
        "minting address" (you can use other addresses).
      </p>
      <Codeblock data={codeSnippet1} />
      <p>Then, we define the metadata.</p>
      <Codeblock data={codeSnippet2} />
      <p>
        Finally, we create a transaction and mint the asset with the lower level
        APIs.
      </p>
      <Codeblock data={codeSnippet3} />
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
    const tokenName = "MeshToken";
    const tokenNameHex = stringToHex(tokenName);
    const metadata = { [policyId]: { [tokenName]: { ...demoAssetMetadata } } };

    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .mint("1", policyId, tokenNameHex)
      .mintingScript(forgingScript)
      .metadataValue(721, metadata)
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = `import { MeshTxBuilder, ForgeScript, resolveScriptHash, stringToHex } from '@meshsdk/core';\n`;
  codeSnippet += `import type { Asset } from '@meshsdk/core';\n`;
  codeSnippet += `\n`;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n`;
  codeSnippet += `const forgingScript = ForgeScript.withOneSignature(changeAddress);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const demoAssetMetadata = {\n`;
  codeSnippet += `  name: "Mesh Token",\n`;
  codeSnippet += `  image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",\n`;
  codeSnippet += `  mediaType: "image/jpg",\n`;
  codeSnippet += `  description: "This NFT was minted by Mesh (https://meshjs.dev/).",\n`;
  codeSnippet += `};\n`;
  codeSnippet += `const policyId = resolveScriptHash(forgingScript);\n`;
  codeSnippet += `const tokenName = "MeshToken";\n`;
  codeSnippet += `const tokenNameHex = stringToHex(tokenName);\n`;
  codeSnippet += `const metadata = { [policyId]: { [tokenName]: { ...demoAssetMetadata } } };\n\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `const unsignedTx = await txBuilder\n`;
  codeSnippet += `  .mint("1", policyId, tokenNameHex)\n`;
  codeSnippet += `  .mintingScript(forgingScript)\n`;
  codeSnippet += `  .metadataValue(721, metadata)\n`;
  codeSnippet += `  .changeAddress(changeAddress)\n`;
  codeSnippet += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet += `  .complete();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Mint Asset"
      subtitle="Mint an asset with a native script"
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
