import { useState } from "react";

import { PlutusScript, serializePlutusScript } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset, demoPlutusAlwaysSucceedScript } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderContractLockAssets() {
  return (
    <TwoColumnsScroll
      sidebarTo="TxbuilderContractLockAssets"
      title="Lock Assets"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeInline = `// For inline datum`;
  codeInline += `txBuilder\n`;
  codeInline += `  .txOut(address, assets)\n`;
  codeInline += `  .txOutInlineDatumValue(data)\n`;
  let codeHash = `// For datum hash`;
  codeHash += `txBuilder\n`;
  codeHash += `  .txOut(address, assets)\n`;
  codeHash += `  .txOutDatumHashValue(data)\n`;
  let codeInlineJSON = `// For inline datum provided in JSON`;
  codeInlineJSON += `txBuilder\n`;
  codeInlineJSON += `  .txOut(address, assets)\n`;
  codeInlineJSON += `  .txOutInlineDatumValue(jsonData, "JSON")\n`;

  return (
    <>
      <p>
        Locking assets meaning sending value to a script address with datum.
      </p>
      <p>
        Same as <code>Transaction</code> demo, we will lock selected assets from
        your wallet in an
        <code>always succeed</code> smart contract. We use one API to represent
        sending value, another API to represent attaching datum to complete the
        locking assets process:
      </p>
      <Codeblock data={codeInline} />
      <Codeblock data={codeHash} />
      <p>
        The lower level APIs support providing your datum in all Mesh{" "}
        <code>Data</code> (default), JSON and CBOR representations. For details
        and helper utilities, please check{" "}
        <Link href="/apis/data">Data section</Link>.
      </p>
      <Codeblock data={codeInlineJSON} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [userInput, setUserInput] = useState<string>(demoAsset);
  const [userInput2, setUserInput2] = useState<string>("meshsecretcode");

  async function runDemo() {
    const utxos = await wallet.getUtxos();

    const changeAddress = await wallet.getChangeAddress();

    const script: PlutusScript = {
      code: demoPlutusAlwaysSucceedScript,
      version: "V2",
    };
    const { address: scriptAddress } = serializePlutusScript(script);

    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .txOut(scriptAddress, [{ unit: userInput, quantity: "1" }])
      .txOutInlineDatumValue(userInput2)
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = ``;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const script: PlutusScript = {\n`;
  codeSnippet += `  code: demoPlutusAlwaysSucceedScript,\n`;
  codeSnippet += `  version: "V2",\n`;
  codeSnippet += `};\n`;
  codeSnippet += `const { address: scriptAddress } = serializePlutusScript(script);\n`;
  codeSnippet += `\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `const unsignedTx = await txBuilder\n`;
  codeSnippet += `  .txOut(scriptAddress, [{ unit: "${userInput}", quantity: "1" }])\n`;
  codeSnippet += `  .txOutInlineDatumValue("${userInput2}")\n`;
  codeSnippet += `  .changeAddress(changeAddress)\n`;
  codeSnippet += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet += `  .complete();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Lock Assets"
      subtitle="Lock assets in a Plutus script"
      code={codeSnippet}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Asset unit"
            label="Asset unit"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Datum"
            label="Datum"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
