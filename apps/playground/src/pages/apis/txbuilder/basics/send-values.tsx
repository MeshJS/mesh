import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";
import { getTxBuilder } from "../common";

export default function TxbuilderSendValue() {
  return (
    <TwoColumnsScroll
      sidebarTo="sendValue"
      title="Send Value"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = ``;
  code1 += `txBuilder\n`;
  code1 += `  .txIn(utxo.input.txHash, utxo.input.outputIndex)\n`;
  code1 += `  .txOut(address, [{ unit: "lovelace", quantity: '1000000' }])\n`;
  code1 += `  .changeAddress(await wallet.getChangeAddress());\n`;

  return (
    <>
      <p>
        Sending values to a recipient is a common operation in blockchain
        transactions. The Mesh SDK provides a simple way to build a transaction
        to send values to a recipient.
      </p>
      <p>
        The following shows a simple example of building a transaction to send
        values to a recipient:
      </p>
      <Codeblock data={code1} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [address, setAddress] = useState<string>(demoAddresses.testnet);
  const [amount, setAmount] = useState<string>("2000000");

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();
    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .txOut(address, [{ unit: "lovelace", quantity: amount }])
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = `import {  MeshTxBuilder } from "@meshsdk/core";\n`;
  codeSnippet += `\n`;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n`;
  codeSnippet += `const txBuilder = getTxBuilder();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await txBuilder\n`;
  codeSnippet += `  .txOut('${address}', [{ unit: "lovelace", quantity: '${amount}' }])\n`;
  codeSnippet += `  .changeAddress(changeAddress)\n`;
  codeSnippet += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet += `  .complete();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Send Value"
      subtitle="Send assets to a recipient."
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
