import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Textarea from "~/components/form/textarea";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderCip20() {
  return (
    <TwoColumnsScroll
      sidebarTo="cip20"
      title="Set Metadata - Taransaction message"
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
        Add messages / comments / memos as transaction metadata. This is useful
        for attaching additional information to a transaction. This is an
        example of setting metadata with transaction message.
      </p>
      <Codeblock data={code} />
      <p>
        The specification for the individual strings follow the general design
        specification for JSON metadata, which is already implemented and in
        operation on the cardano blockchain. The used metadatum label is{" "}
        <code>674</code>: this number was chosen because it is the T9 encoding
        of the string
        <code>msg</code>. The message content has the key <code>msg</code>: and
        consists of an array of individual message-strings. The number of theses
        message-strings must be at least one for a single message, more for
        multiple messages/lines. Each of theses individual message-strings array
        entries must be at most 64 bytes when UTF-8 encoded.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [message, setMessage] = useState<string>(
    "Invoice-No: 1234567890\nCustomer-No: 555-1234",
  );

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();
    const txBuilder = getTxBuilder();

    const label = 674;
    const metadata = {
      msg: message.split("\n"),
    };

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
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n\n`;
  codeSnippet += `const label = 674;\n`;
  codeSnippet += `const metadata = {\n`;
  codeSnippet += `  msg: [\n`;
  for (let line of message.split("\n")) {
    codeSnippet += `    '${line}',\n`;
  }
  codeSnippet += `  ],\n`;
  codeSnippet += `});\n\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `const unsignedTx = await txBuilder\n`;
  codeSnippet += `  .changeAddress(changeAddress)\n`;
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
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            label="Message (breakline for new line)"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
