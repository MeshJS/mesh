import {
  cst,
  ForgeScript,
  resolveScriptHash,
  stringToHex,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata } from "~/data/cardano";
import { getTxBuilder } from "../common";

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
  let code1 = ``;
  code1 += `const unsignedTx = await txBuilder\n`;
  code1 += `  .txIn(utxo.input.txHash, utxo.input.outputIndex)\n`;
  code1 += `  .mint("1", policyId, tokenName)\n`;
  code1 += `  .mintingScript(forgingScript)\n`;
  code1 += `  .changeAddress(changeAddress)\n`;
  code1 += `  .complete();\n`;

  return (
    <>
      <p>
        Sending values to a recipient is a common operation in blockchain
        transactions. The Mesh SDK provides a simple way to build a transaction
        to send values to a recipient.
      </p>
      <Codeblock data={code1} />
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
      .metadataValue("721", metadata)
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  // todo docs, determine the `cst` import
  let codeSnippet = ``;

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
