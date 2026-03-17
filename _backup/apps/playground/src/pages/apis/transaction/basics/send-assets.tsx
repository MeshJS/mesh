import { useState } from "react";

import { Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses, demoAsset } from "~/data/cardano";

export default function TransactionSendAssets() {
  return (
    <TwoColumnsScroll
      sidebarTo="sendAssets"
      title="Send Assets"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        You can chain the component to send assets to multiple recipients. For
        each recipients, append:
      </p>
      <Codeblock data={`tx.sendAssets(address: string, assets: Asset[]);`} />
      <p>
        The <code>Asset</code> object is defined as:
      </p>
      <Codeblock
        data={`{\n  unit: '{policy_ID}{asset_name_in_hex}',\n  quantity: '1',\n}`}
      />
      <p>
        The <code>unit</code> field is the policy ID and asset name in hex
        format. The <code>quantity</code> field is the amount of the asset to
        send.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [address, setAddress] = useState<string>(demoAddresses.testnet);
  const [asset, setAsset] = useState<string>(demoAsset);
  const [amount, setAmount] = useState<string>("1");

  async function runDemo() {
    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.sendAssets({ address: address }, [
      {
        unit: asset,
        quantity: amount,
      },
    ]);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.sendAssets(\n`;
  codeSnippet += `  { address: '${address}' },\n`;
  codeSnippet += `  [\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      unit: '${asset}',\n`;
  codeSnippet += `      quantity: '${amount}',\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `  ]\n`;
  codeSnippet += `);\n`;

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <LiveCodeDemo
      title="Send Assets"
      subtitle="Send assets to a recipient"
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
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="Asset"
            label="Asset"
            key={1}
          />,
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            label="Amount"
            key={2}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
