import { ForgeScript, MeshWallet, Mint, Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { getProvider } from "~/components/cardano/mesh-wallet";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata, demoMnemonic } from "~/data/cardano";

export default function TransactionMultisig() {
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
  let codeTx = ``;
  codeTx += `const tx = new Transaction({ initiator: wallet });\n`;
  codeTx += `tx.mintAsset(forgingScript, asset);\n`;
  codeTx += `\n`;
  codeTx += `const unsignedTx = await tx.build();\n`;
  codeTx += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeTx += `const signedTx2 = await mintingWallet.signTx(signedTx, true);\n`;

  let codeSign = `await wallet.signTx(unsignedTx, true);`;

  return (
    <>
      <p>
        The main idea of a multi-signature transaction is to have multiple
        signatures to authorize a transaction.
      </p>
      <p>
        Here are a few scenarios where multi-signature transactions are useful:
      </p>
      <ul>
        <li>
          you want to create a transaction with a backend and send to the
          frontend for the user to sign
        </li>
        <li>
          when you use a forge script which requires the user to pay for the
          minting fee
        </li>
        <li>when redeeming an asset from a script</li>
      </ul>
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

    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];

    const asset: Mint = {
      assetName: "MeshToken",
      assetQuantity: "1",
      metadata: demoAssetMetadata,
      label: "721",
      recipient: address,
    };

    const tx = new Transaction({ initiator: wallet }).setNetwork('preprod');
    tx.mintAsset(forgingScript, asset);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx, true);
    const signedTx2 = await mintingWallet.signTx(signedTx, true);
    const txHash = await wallet.submitTx(signedTx2);
    return txHash;
  }

  let codeSnippet = `import { MeshWallet, ForgeScript, Mint, Transaction } from '@meshsdk/core';\n\n`;
  codeSnippet += `const mintingWallet = new MeshWallet({\n`;
  codeSnippet += `  networkId: 0,\n`;
  codeSnippet += `  fetcher: provider,\n`;
  codeSnippet += `  submitter: provider,\n`;
  codeSnippet += `  key: {\n`;
  codeSnippet += `    type: "mnemonic",\n`;
  codeSnippet += `    words: demoMnemonic,\n`;
  codeSnippet += `  },\n`;
  codeSnippet += `});\n`;
  codeSnippet += `const forgingScript = ForgeScript.withOneSignature(\n`;
  codeSnippet += `  mintingWallet.getChangeAddress(),\n`;
  codeSnippet += `);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet += `const address = usedAddress[0];\n`;
  codeSnippet += `\n`;
  codeSnippet += `const asset: Mint = {\n`;
  codeSnippet += `  assetName: "MeshToken",\n`;
  codeSnippet += `  assetQuantity: "1",\n`;
  codeSnippet += `  metadata: demoAssetMetadata,\n`;
  codeSnippet += `  label: "721",\n`;
  codeSnippet += `  recipient: address,\n`;
  codeSnippet += `};\n`;
  codeSnippet += `\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.mintAsset(forgingScript, asset);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await tx.build();\n`;
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
