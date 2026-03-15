import { useState } from "react";

import {
  ForgeScript,
  MeshTxBuilder,
  resolveScriptHash,
  RoyaltiesStandard,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";
import { txbuilderCode } from "../common";

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
  codeSnippet += `const assetMetadata = {\n`;
  codeSnippet += `  rate: '0.2',\n`;
  codeSnippet += `  addr: '${demoAddresses.testnet}'\n`;
  codeSnippet += `};\n`;

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

      <p>Here is the example of the metadata:</p>
      <Codeblock data={codeSnippet} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("0.2");
  const [userInput2, setUserInput2] = useState<string>(demoAddresses.testnet);

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];

    if (address === undefined) {
      throw "No address found";
    }

    const forgingScript = ForgeScript.withOneSignature(address);
    const policyId = resolveScriptHash(forgingScript);

    const assetMetadata: RoyaltiesStandard = {
      rate: userInput,
      address: userInput2,
    };

    const txBuilder = new MeshTxBuilder();

    const unsignedTx = await txBuilder
      .mint("1", policyId, "")
      .mintingScript(forgingScript)
      .metadataValue(777, assetMetadata)
      .changeAddress(address)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let code = ``;
  code += `const utxos = await wallet.getUtxos();\n`;
  code += `const usedAddress = await wallet.getUsedAddresses();\n`;
  code += `const address = usedAddress[0];\n`;
  code += `\n`;
  code += `if (address === undefined) {\n`;
  code += `  throw "No address found";\n`;
  code += `}\n`;
  code += `\n`;
  code += `const forgingScript = ForgeScript.withOneSignature(address);\n`;
  code += `const policyId = resolveScriptHash(forgingScript);\n`;
  code += `\n`;
  code += `const assetMetadata: RoyaltiesStandard = {\n`;
  code += `  rate: '${userInput}',\n`;
  code += `  address: '${userInput2}',\n`;
  code += `};\n`;
  code += `\n`;
  code += txbuilderCode;
  code += `const unsignedTx = await txBuilder\n`;
  code += `  .mint("1", policyId, "")\n`;
  code += `  .mintingScript(forgingScript)\n`;
  code += `  .metadataValue(777, assetMetadata)\n`;
  code += `  .changeAddress(address)\n`;
  code += `  .selectUtxosFrom(utxos)\n`;
  code += `  .complete();\n`;
  code += `\n`;
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
