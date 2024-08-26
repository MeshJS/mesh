import { useState } from "react";

import { Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TransactionSetMetadata() {
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
  return (
    <>
      <p>
        Add messages/comments/memos as transaction metadata. This is useful for
        attaching additional information to a transaction.
      </p>
      <Codeblock data={`tx.setMetadata(0, 'Your message here');`} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [message, setMessage] = useState<string>(
    "This is a message from the Mesh SDK",
  );

  async function runDemo() {
    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.setMetadata(0, message);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.setMetadata(0, '${message}');\n\n`;

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
