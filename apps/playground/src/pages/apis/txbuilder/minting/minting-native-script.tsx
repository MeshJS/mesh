import {
  deserializeAddress,
  ForgeScript,
  NativeScript,
  resolveScriptHash,
  stringToHex,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderMintingNativeScript() {
  return (
    <TwoColumnsScroll
      sidebarTo="mintingNativeScript"
      title="Minting Assets with Native Script"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSnippet = `txBuilder\n`;
  codeSnippet += `  .mint("1", policyId, tokenNameHex)\n`;
  codeSnippet += `  .mintingScript(forgingScript)\n`;

  return (
    <>
      <p>
        The above minting and burning one signature are indeed the mint and burn
        with native script examples. Here we would explain the logic you need to
        know for native script minting.
      </p>
      <p>
        With <code>MeshTxBuilder</code>, you just need <code>.mint()</code> and
        provide script to mint or burn native script tokens:
      </p>

      <Codeblock data={codeSnippet} />
      <p>
        On top on these 2 core logics, you can attach metadata if needed with{" "}
        <code>.metadataValue()</code>, and construct the transaction as needed.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();

    const { pubKeyHash: keyHash } = deserializeAddress(changeAddress);

    const nativeScript: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "before",
          slot: "99999999",
        },
        {
          type: "sig",
          keyHash: keyHash,
        },
      ],
    };
    const forgingScript = ForgeScript.fromNativeScript(nativeScript);

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
      .invalidHereafter(99999999)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = `const utxos = await wallet.getUtxos();
const changeAddress = await wallet.getChangeAddress();

const { pubKeyHash: keyHash } = deserializeAddress(changeAddress);

const nativeScript: NativeScript = {
  type: "all",
  scripts: [
    {
      type: "before",
      slot: "99999999",
    },
    {
      type: "sig",
      keyHash: keyHash,
    },
  ],
};
const forgingScript = ForgeScript.fromNativeScript(nativeScript);

const policyId = resolveScriptHash(forgingScript);
const tokenName = "MeshToken";
const tokenNameHex = stringToHex(tokenName);
const metadata = { [policyId]: { [tokenName]: { ...demoAssetMetadata } } };

${txbuilderCode}
const unsignedTx = await txBuilder
  .mint("1", policyId, tokenNameHex)
  .mintingScript(forgingScript)
  .metadataValue(721, metadata)
  .changeAddress(changeAddress)
  .invalidHereafter(99999999)
  .selectUtxosFrom(utxos)
  .complete();

const signedTx = await wallet.signTx(unsignedTx);
const txHash = await wallet.submitTx(signedTx);`;

  return (
    <LiveCodeDemo
      title="Mint Assets with Native Script"
      subtitle="Mint native assets with Native Script"
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
      code={code}
    ></LiveCodeDemo>
  );
}
