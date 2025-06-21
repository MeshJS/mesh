import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Textarea from "~/components/form/textarea";
import Select from "~/components/form/select";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderScriptMetadata() {
  return (
    <TwoColumnsScroll
      sidebarTo="scriptMetadata"
      title="Set Script Metadata"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Add a metadata script to the transaction using <code>.metadataScript()</code>. This demo shows how to attach a CBOR-encoded script along with its type to a transaction.
        The accepted script types are: <code>Native</code>, <code>PlutusV1</code>, <code>PlutusV2</code>, and <code>PlutusV3</code>.
      </p>
      <Codeblock
        data={`txBuilder\n  .metadataScript(scriptCbor, scriptType)\n`}
      />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [scriptCbor, setScriptCbor] = useState<string>("830302828200581c4fa1dd19be215b14a30f2a73f8b29e25bc917fbb2b3325b18394dca78200581c546a29981d02d06ea800e9bb9da1a9d8fc0e251a52a683f55bd7aa8f");
  const [scriptType, setScriptType] = useState<"PlutusV1" | "PlutusV2" | "PlutusV3" | "Native">("Native");

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();
    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .changeAddress(changeAddress)
      .metadataScript(scriptCbor, scriptType)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let codeSnippet = ``;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n\n`;
  codeSnippet += `const scriptCbor = "${scriptCbor}";\n`;
  codeSnippet += `const scriptType = "${scriptType}";\n\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `const unsignedTx = await txBuilder\n`;
  codeSnippet += `  .changeAddress(changeAddress)\n`;
  codeSnippet += `  .metadataScript(scriptCbor, scriptType)\n`;
  codeSnippet += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet += `  .complete();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Add Script"
      subtitle="Add a script to a transaction's metadata."
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
          <Textarea
            value={scriptCbor}
            onChange={(e) => setScriptCbor(e.target.value)}
            label="Script CBOR"
            key="script-cbor"
          />,
          <Select
            key="script-type"
            id="scriptType"
            label="Script Type"
            value={scriptType}
            onChange={(e) =>
              setScriptType(e.target.value as "PlutusV1" | "PlutusV2" | "PlutusV3" | "Native")
            }
            options={{
              PlutusV1: "PlutusV1",
              PlutusV2: "PlutusV2",
              PlutusV3: "PlutusV3",
              Native: "Native",
            }}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
