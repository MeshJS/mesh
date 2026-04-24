import { AssetMetadata, ForgeScript, Mint, Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses, demoAssetMetadata } from "~/data/cardano";

export default function MintingOneSignature() {
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
  codeSnippet1 += `// use browser wallet to get address\n`;
  codeSnippet1 += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet1 += `const address = usedAddress[0];\n`;
  codeSnippet1 += `// use app wallet to get address\n`;
  codeSnippet1 += `const address = wallet.getPaymentAddress();\n\n`;
  codeSnippet1 += `// create forgingScript\n`;
  codeSnippet1 += `const forgingScript = ForgeScript.withOneSignature(address);`;

  let codeSnippet2 = `const assetMetadata: AssetMetadata = ${JSON.stringify(
    demoAssetMetadata,
    null,
    2,
  )};\n\n`;
  codeSnippet2 += `const asset: Mint = {\n`;
  codeSnippet2 += `  assetName: 'MeshToken',\n`;
  codeSnippet2 += `  assetQuantity: '1',\n`;
  codeSnippet2 += `  metadata: assetMetadata,\n`;
  codeSnippet2 += `  label: '721',\n`;
  codeSnippet2 += `  recipient: '${demoAddresses.testnet}' \n`;
  codeSnippet2 += `};\n`;

  let codeSnippet3 = `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet3 += `tx.mintAsset(\n`;
  codeSnippet3 += `  forgingScript,\n`;
  codeSnippet3 += `  asset,\n`;
  codeSnippet3 += `);\n\n`;
  codeSnippet3 += `const unsignedTx = await tx.build();\n`;
  codeSnippet3 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet3 += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        In this section, we will see how to mint native assets with a{" "}
        <code>ForgeScript</code>. For minting assets with smart contract, visit{" "}
        <Link href="/apis/transaction/smart-contract#plutusminting">
          Transaction - Smart Contract - Minting Assets with Smart Contract
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
        Finally, we create a transaction and mint the asset with the{" "}
        <code>mintAsset</code> method.
      </p>
      <Codeblock data={codeSnippet3} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];

    if (address === undefined) {
      throw "No address found";
    }

    // create forgingScript
    const forgingScript = ForgeScript.withOneSignature(address);

    // create asset metadata
    const assetMetadata: AssetMetadata = demoAssetMetadata;

    const asset: Mint = {
      assetName: "MeshToken",
      assetQuantity: "1",
      metadata: assetMetadata,
      label: "721",
      recipient: address,
    };

    const tx = new Transaction({ initiator: wallet });
    tx.setNetwork("preprod");
    tx.mintAsset(forgingScript, asset);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  return (
    <LiveCodeDemo
      title="Mint Native Assets"
      subtitle="Mint native assets with ForgeScript"
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    ></LiveCodeDemo>
  );
}
