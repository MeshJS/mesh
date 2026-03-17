import { useState } from "react";

import { Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TransactionHandle() {
  return (
    <TwoColumnsScroll
      sidebarTo="handler"
      title="Send Assets to Handle"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `const provider = new BlockfrostProvider('API_KEY_HERE');\n`;
  example += `const address = await provider.fetchHandleAddress('mesh');\n\n`;
  example += `const tx = new Transaction({ initiator: wallet });\n`;
  example += `tx.sendLovelace(address, '1000000');\n`;

  return (
    <>
      <p>
        Send assets to a handle. Initialize a provider and fetch the address of
        a handle.
      </p>
      <p>The handle should be a valid handle on the mainnet.</p>
      <Codeblock data={example} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [handle, setHandle] = useState<string>("mesh");
  const [amount, setAmount] = useState<string>("1000000");

  async function runDemo() {
    const provider = getProvider("mainnet");
    const address = await provider.fetchHandleAddress(handle);

    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.sendLovelace(address, amount);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let codeSnippet = `import { BlockfrostProvider, Transaction } from '@meshsdk/core';\n\n`;

  codeSnippet += `const provider = new BlockfrostProvider('API_KEY_HERE');\n`;
  codeSnippet += `const address = await provider.fetchHandleAddress('${handle}');\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.sendLovelace(address, '${amount}');\n\n`;

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <LiveCodeDemo
      title="Send ADA to handle"
      subtitle="Send assets to a handle. (Note: this demo only works on mainnet)"
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
            placeholder="Handle"
            label="Handle"
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
