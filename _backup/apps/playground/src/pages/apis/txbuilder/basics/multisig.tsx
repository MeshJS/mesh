import {
  ForgeScript,
  MeshWallet,
  resolveScriptHash,
  stringToHex,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { getProvider } from "~/components/cardano/mesh-wallet";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata, demoMnemonic } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderMultisig() {
  return (
    <TwoColumnsScroll
      sidebarTo="multisig"
      title="Multi-signature Transaction"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeTx = txbuilderCode;
  codeTx += `const unsignedTx = await txBuilder\n`;
  codeTx += `  .mint("1", policyId, stringToHex("MeshToken"))\n`;
  codeTx += `  .mintingScript(forgingScript)\n`;
  codeTx += `  .metadataValue(721, { [policyId]: { [assetName]: demoAssetMetadata } })\n`;
  codeTx += `  .changeAddress(address)\n`;
  codeTx += `  .selectUtxosFrom(utxos)\n`;
  codeTx += `  .complete();\n`;
  codeTx += `\n`;
  codeTx += `const signedTx = await wallet1.signTx(unsignedTx, true);\n`;
  codeTx += `const signedTx2 = await mintingWallet.signTx(signedTx, true);\n`;
  codeTx += `const txHash = await wallet.submitTx(signedTx2);\n`;

  let codeSign = `await wallet.signTx(unsignedTx, true);`;

  return (
    <>
      <p>
        The main idea of a multi-signature (multisig) transaction is to have
        multiple signatures to authorize a transaction.
      </p>
      <Codeblock data={codeTx} />
      <p>
        In the above code snippet, we are signing the transaction with the user
        wallet and then signing the transaction with the minting wallet. The
        <code>signTx</code> function is used to sign the transaction. The second
        argument is a boolean value that indicates whether the transaction is a
        multi-signature transaction.
      </p>
      <Codeblock data={codeSign} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const provider = getProvider();
    const mintingWallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: {
        type: "mnemonic",
        words: demoMnemonic,
      },
    });
    const forgingScript = ForgeScript.withOneSignature(
      await mintingWallet.getChangeAddress(),
    );
    const assetName = "MeshToken";
    const policyId = resolveScriptHash(forgingScript);

    const usedAddress = await wallet.getUsedAddresses();
    const utxos = await wallet.getUtxos();
    const address = usedAddress[0]!;

    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .mint("1", policyId, stringToHex("MeshToken"))
      .mintingScript(forgingScript)
      .metadataValue(721, { [policyId]: { [assetName]: demoAssetMetadata } })
      .changeAddress(address)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx, true);
    const signedTx2 = await mintingWallet.signTx(signedTx, true);
    const txHash = await wallet.submitTx(signedTx2);
    return txHash;
  }

  let codeSnippet = ``;
  codeSnippet += `const mintingWallet = new MeshWallet({\n`;
  codeSnippet += `  networkId: 0,\n`;
  codeSnippet += `  fetcher: provider,\n`;
  codeSnippet += `  submitter: provider,\n`;
  codeSnippet += `  key: {\n`;
  codeSnippet += `    type: "mnemonic",\n`;
  codeSnippet += `    words: ['your','mnemonic','here'],\n`;
  codeSnippet += `  },\n`;
  codeSnippet += `});\n`;
  codeSnippet += `\n`;
  codeSnippet += `const forgingScript = ForgeScript.withOneSignature(\n`;
  codeSnippet += `  await mintingWallet.getChangeAddress(),\n`;
  codeSnippet += `);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const assetName = "MeshToken";\n`;
  codeSnippet += `const policyId = resolveScriptHash(forgingScript);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const address = usedAddress[0]!;\n`;
  codeSnippet += `\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `const unsignedTx = await txBuilder\n`;
  codeSnippet += `  .mint("1", policyId, stringToHex("MeshToken"))\n`;
  codeSnippet += `  .mintingScript(forgingScript)\n`;
  codeSnippet += `  .metadataValue(721, { [policyId]: { [assetName]: demoAssetMetadata } })\n`;
  codeSnippet += `  .changeAddress(address)\n`;
  codeSnippet += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet += `  .complete();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeSnippet += `const signedTx2 = await mintingWallet.signTx(signedTx, true);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx2);\n`;

  return (
    <LiveCodeDemo
      title="Multi-signature Transaction"
      subtitle="Create a multi-signature transaction. In this demo, we will create a transaction with two signatures, where one signature is from the user wallet and the other is from a minting wallet."
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
