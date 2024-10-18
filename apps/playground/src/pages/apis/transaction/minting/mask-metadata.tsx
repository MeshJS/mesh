import {
  AssetMetadata,
  deserializeAddress,
  ForgeScript,
  Mint,
  NativeScript,
  Transaction,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses, demoAssetMetadata } from "~/data/cardano";

export default function MintingMaskMetadata() {
  return (
    <TwoColumnsScroll
      sidebarTo="maskMetadata"
      title="Mask asset metadata"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSnippet1 = ``;
  codeSnippet1 += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet1 += `tx.mintAsset(forgingScript, asset1);\n`;
  codeSnippet1 += `...\n`;
  codeSnippet1 += `const unsignedTx = await tx.build();\n`;

  let codeSnippet2 = `const originalMetadata = Transaction.readMetadata(unsignedTx);`;

  let codeSnippet3 = `const maskedTx = Transaction.maskMetadata(unsignedTx);`;

  let codeSnippet4 = `const signedTx = await wallet.signTx(maskedTx);`;

  let codeSnippet5 = ``;
  codeSnippet5 += `const signedOriginalTx = Transaction.writeMetadata(\n`;
  codeSnippet5 += `  signedTx,\n`;
  codeSnippet5 += `  originalMetadata,\n`;
  codeSnippet5 += `);\n\n`;
  codeSnippet5 += `const txHash = await wallet.submitTx(signedOriginalTx);`;

  return (
    <>
      <p>
        Masking metadata is a way to hide the metadata from the transaction
        before signing it. This is useful when you want to keep the metadata
        private until the transaction is signed. Check the{" "}
        <Link href="guides/multisig-minting">Multisig Multing guide</Link> for a
        end-to-end example.
      </p>
      <p>
        In the following code snippet, we will see how to mask metadata before
        signing the transaction. First we build the minting transaction, check
        the other sections for more details.
      </p>
      <Codeblock data={codeSnippet1} />
      <p>
        After building the transaction, we can save the original metadata to use
        it later.
      </p>
      <Codeblock data={codeSnippet2} />
      <p>
        Mask the metadata before sending it to the user for signing the
        transaction.
      </p>
      <Codeblock data={codeSnippet3} />
      <p>The user signs the transaction with the masked metadata.</p>
      <Codeblock data={codeSnippet4} />
      <p>
        After the user signs the transaction, we can write the original metadata
        back to the transaction. Then we submit the transaction to the network.
      </p>
      <Codeblock data={codeSnippet5} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];

    if (address === undefined) {
      throw "Address not found";
    }

    const { pubKeyHash: keyHash } = deserializeAddress(address);

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

    const asset1: Mint = {
      assetName: "MeshToken",
      assetQuantity: "1",
      metadata: demoAssetMetadata,
      label: "721",
      recipient: address,
    };

    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.mintAsset(forgingScript, asset1);
    tx.setTimeToExpire("99999999");
    const unsignedTx = await tx.build();

    const originalMetadata = Transaction.readMetadata(unsignedTx);

    const maskedTx = Transaction.maskMetadata(unsignedTx);

    const signedTx = await wallet.signTx(maskedTx);

    const signedOriginalTx = Transaction.writeMetadata(
      signedTx,
      originalMetadata,
    );

    const txHash = await wallet.submitTx(signedOriginalTx);

    return txHash;
  }

  return (
    <LiveCodeDemo
      title="Mint Assets with Masked Metadata"
      subtitle="Mint native assets with ForgeScript and mask metadata"
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    ></LiveCodeDemo>
  );
}
