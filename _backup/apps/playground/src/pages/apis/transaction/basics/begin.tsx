import { useState } from "react";

import { BeginProvider, Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TransactionBegin() {
  return (
    <TwoColumnsScroll
      sidebarTo="begin"
      title="Send Assets to Begin ID"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `const provider = new BeginProvider();\n`;
  example += `const beginId = await provider.resolveAddress('mesh');\n`;
  example += `const address = beginId.address;\n\n`;
  example += `const tx = new Transaction({ initiator: wallet });\n`;
  example += `tx.sendLovelace(address, '1000000');\n`;

  return (
    <>
      <p>
        Send assets to a Begin ID. Initialize <code>BeginProvider</code> and
        fetch the address.
      </p>
      <p>Must be a valid name on the mainnet.</p>
      <Codeblock data={example} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [handle, setHandle] = useState<string>("mesh");
  const [amount, setAmount] = useState<string>("1000000");

  async function runDemo() {
    const provider = new BeginProvider();
    const beginId = await provider.resolveAddress(handle);
    const address = beginId.address;

    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.sendLovelace(address, amount);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let codeSnippet = `import { BeginProvider, Transaction } from '@meshsdk/core';\n\n`;

  codeSnippet += `const provider = new BeginProvider();\n`;
  codeSnippet += `const beginId = await provider.resolveAddress('${handle}');\n`;
  codeSnippet += `const address = beginId.address;\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.sendLovelace(address, '${amount}');\n\n`;

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <LiveCodeDemo
      title="Send ADA to Begin ID"
      subtitle="Send assets to a Begin ID. (Note: this demo only works on mainnet)"
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
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Begin ID"
            label="Begin ID"
            key={0}
          />,
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Lovelace amount"
            label="Lovelace amount"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
