import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

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
  code1 += `  .txOut(address, [{ unit: "lovelace", quantity: amount }])\n`;
  code1 += `  .changeAddress(changeAddress)\n`;
  code1 += `  .selectUtxosFrom(utxos)\n`;
  code1 += `  .complete();\n`;

  return (
    <>
      <p>
        Sending value with <code>MeshTxBuilder</code> come with the{" "}
        <code>.txOut()</code> endpoint:
      </p>
      <Codeblock data={`.txOut(address: string, amount: Asset[])`} />
      <p>
        In order to send values (so as every Cardano transaction), we have to
        fund the transaction to do so. There are 2 ways to provide values in a
        transaction:
      </p>
      <ul>
        <li>
          <p>Specifying which input to spend with</p>
          <Codeblock
            data={`.txIn(txHash: string, txIndex: number, amount?: Asset[], address?: string)`}
          />
        </li>
        <li>
          <p>Providing an array of UTxOs, and perform auto UTxO selection:</p>
          <Codeblock
            data={`.selectUtxosFrom(extraInputs: UTxO[])`}
          />
        </li>
      </ul>
      <p>
        Since the input and output values might not be the same, we have to
        specify the address (usually own's address) to receive change:
      </p>
      <Codeblock data={`.changeAddress(addr: string)`} />
      <p>
        The following shows a simple example of building a transaction to send
        values with UTxO selection:
      </p>
      <Codeblock data={code1} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [address, setAddress] = useState<string>(demoAddresses.testnet);
  const [amount, setAmount] = useState<string>("1000000");

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

  let codeSnippet = ``;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n`;
  codeSnippet += `\n`;
  codeSnippet += txbuilderCode;
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
