import { useState } from "react";

import {
  ForgeScript,
  Mint,
  RoyaltiesStandard,
  Transaction,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";

export default function MintingRoyaltyToken() {
  return (
    <TwoColumnsScroll
      sidebarTo="mintingRoyaltyToken"
      title="Minting Royalty Token"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSnippet = ``;
  codeSnippet += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet += `const address = usedAddress[0];\n`;
  codeSnippet += `\n`;
  codeSnippet += `// create forgingScript, you can also use native script here\n`;
  codeSnippet += `const forgingScript = ForgeScript.withOneSignature(address);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `\n`;
  codeSnippet += `const _assetMetadata = {\n`;
  codeSnippet += `  rate: '0.2',\n`;
  codeSnippet += `  addr: '${demoAddresses.testnet}'\n`;
  codeSnippet += `};\n`;
  codeSnippet += `const asset: Mint = {\n`;
  codeSnippet += `  assetName: '',\n`;
  codeSnippet += `  assetQuantity: '1',\n`;
  codeSnippet += `  metadata: _assetMetadata,\n`;
  codeSnippet += `  label: '777',\n`;
  codeSnippet += `  recipient: address,\n`;
  codeSnippet += `};\n`;
  codeSnippet += `\n`;
  codeSnippet += `tx.mintAsset(forgingScript, asset);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        Royalty tokens is a special type of token that allows the creator to
        collect a royalty fee, this proposed standard will allow for uniform
        royalties' distributions across the secondary market space. Read{" "}
        <Link href="https://cips.cardano.org/cips/cip27/">CIP-27</Link> for more
        information.
      </p>
      <p>
        The implementation of royalty tokens is very simple, minting a token
        with <code>777</code> label, with "rate" and "addr" in the metadata.
      </p>

      <p>Here is the full code:</p>
      <Codeblock data={codeSnippet} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("0.2");
  const [userInput2, setUserInput2] = useState<string>(demoAddresses.testnet);

  async function runDemo() {
    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];

    if (address === undefined) {
      throw "No address found";
    }

    const forgingScript = ForgeScript.withOneSignature(address);

    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");

    const _assetMetadata: RoyaltiesStandard = {
      rate: userInput,
      address: userInput2,
    };
    const asset: Mint = {
      assetName: "",
      assetQuantity: "1",
      metadata: _assetMetadata,
      label: "777",
      recipient: address,
    };

    tx.mintAsset(forgingScript, asset);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const usedAddress = await wallet.getUsedAddresses();\n`;
  code += `const address = usedAddress[0];\n`;
  code += `\n`;
  code += `const forgingScript = ForgeScript.withOneSignature(address);\n`;
  code += `\n`;
  code += `const tx = new Transaction({ initiator: wallet });\n`;
  code += `\n`;
  code += `const _assetMetadata: RoyaltiesStandard = {\n`;
  code += `  rate: '${userInput}',\n`;
  code += `  address: '${userInput2}',\n`;
  code += `};\n`;
  code += `const asset: Mint = {\n`;
  code += `  assetName: "",\n`;
  code += `  assetQuantity: "1",\n`;
  code += `  metadata: _assetMetadata,\n`;
  code += `  label: "777",\n`;
  code += `  recipient: address,\n`;
  code += `};\n`;
  code += `\n`;
  code += `tx.mintAsset(forgingScript, asset);\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

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
      code={code}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Rate"
            label="Rate"
            key={0}
          />,
        ]}
      />
      <InputTable
        listInputs={[
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Address"
            label="Address"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
