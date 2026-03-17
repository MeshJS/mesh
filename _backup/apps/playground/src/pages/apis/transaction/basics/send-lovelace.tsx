import { useState } from "react";

import { Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";

export default function TransactionSendLovelace() {
  return (
    <TwoColumnsScroll
      sidebarTo="sendLovelace"
      title="Send Lovelace"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        You can chain the component to send lovelace to multiple recipients. For
        each recipients, append:
      </p>
      <Codeblock data={`tx.sendLovelace(address: string, lovelace: string);`} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [address, setAddress] = useState<string>(demoAddresses.testnet);
  const [amount, setAmount] = useState<string>("1000000");

  async function runDemo() {
    const tx = new Transaction({
      initiator: wallet,
      verbose: true,
    })
      .setNetwork("preprod")
      .sendLovelace(address, amount);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet })\n`;
  codeSnippet += `  .sendLovelace(\n`;
  codeSnippet += `    '${address}',\n`;
  codeSnippet += `    '${amount}'\n`;
  codeSnippet += `  );\n\n`;

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <LiveCodeDemo
      title="Send Lovelace"
      subtitle="Send lovelace to a recipient"
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
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address"
            label="Address"
            key={0}
          />,
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            label="Amount"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
