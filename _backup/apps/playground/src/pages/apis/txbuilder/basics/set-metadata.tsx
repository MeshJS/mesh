import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderSetMetadata() {
  return (
    <TwoColumnsScroll
      sidebarTo="metadata"
      title="Set Metadata"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code = `txBuilder\n`;
  code += `  .metadataValue(label, metadata)\n`;

  return (
    <>
      <p>
        Add messages/comments/memos as transaction metadata. This is useful for
        attaching additional information to a transaction.
      </p>
      <Codeblock data={code} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [message, setMessage] = useState<string>(
    "This is a message from the Mesh SDK",
  );

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();
    const txBuilder = getTxBuilder();

    const label = 0;
    const metadata = "This is a message from the Mesh SDK";

    const unsignedTx = await txBuilder
      .changeAddress(changeAddress)
      .metadataValue(label, metadata)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = ``;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const address = await wallet.getChangeAddress();\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `\n`;
  codeSnippet += `const label = 0;\n`;
  codeSnippet += `const metadata = "This is a message from the Mesh SDK";\n\n`;
  codeSnippet += `const unsignedTx = await txBuilder\n`;
  codeSnippet += `  .changeAddress(address)\n`;
  codeSnippet += `  .metadataValue(label, metadata)\n`;
  codeSnippet += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet += `  .complete();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Transaction message"
      subtitle="Add messages/comments/memos as transaction metadata"
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
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            label="Message"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
