import { useState } from "react";

import { Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Textarea from "~/components/form/textarea";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TransactionCip20() {
  return (
    <TwoColumnsScroll
      sidebarTo="cip20"
      title="Transaction message"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Add messages/comments/memos as transaction metadata. This is useful for
        attaching additional information to a transaction.
      </p>
      <Codeblock
        data={`tx.setMetadata(674, { msg: ['Multi-line', 'Message', 'Here'] });`}
      />
      <p>
        The specification for the individual strings follow the general design
        specification for JSON metadata, which is already implemented and in
        operation on the cardano blockchain. The used metadatum label is{" "}
        <code>674</code>:, this number was chosen because it is the T9 encoding
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
    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.setMetadata(674, {
      msg: message.split("\n"),
    });

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.setMetadata(674, {\n`;
  codeSnippet += `  msg: [\n`;
  for (let line of message.split("\n")) {
    codeSnippet += `    '${line}',\n`;
  }
  codeSnippet += `  ],\n`;
  codeSnippet += `});\n\n`;

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

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
