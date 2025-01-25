import { useState } from "react";

import { MeshTxBuilderBody } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderBuildWithObject() {
  return (
    <TwoColumnsScroll
      sidebarTo="buildWithObject"
      title="Build with Object"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = `const meshTxBody: Partial<MeshTxBuilderBody> = {\n`;
  code1 += `  outputs: [\n`;
  code1 += `    {\n`;
  code1 += `      address: address,\n`;
  code1 += `      amount: [{ unit: "lovelace", quantity: amount }],\n`;
  code1 += `    },\n`;
  code1 += `  ],\n`;
  code1 += `  changeAddress: changeAddress,\n`;
  code1 += `  extraInputs: utxos,\n`;
  code1 += `  selectionConfig: {\n`;
  code1 += `    threshold: "5000000",\n`;
  code1 += `    strategy: "largestFirst",\n`;
  code1 += `    includeTxFees: true,\n`;
  code1 += `  },\n`;
  code1 += `};\n`;
  code1 += `\n`;
  code1 += `const unsignedTx = await txBuilder.complete(meshTxBody);`;

  return (
    <>
      <p>
        One alternative to use the lower level APIs is to build the transaction
        with JSON.
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
    const changeAddress = await wallet.getChangeAddress();

    const utxos = await wallet.getUtxos();

    // transaction
    const txBuilder = getTxBuilder();

    const meshTxBody: Partial<MeshTxBuilderBody> = {
      outputs: [
        {
          address: address,
          amount: [{ unit: "lovelace", quantity: amount }],
        },
      ],
      changeAddress: changeAddress,
      extraInputs: utxos,
      selectionConfig: {
        threshold: "5000000",
        strategy: "largestFirst",
        includeTxFees: true,
      },
    };

    const unsignedTx = await txBuilder.complete(meshTxBody);

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = `import { MeshTxBuilder } from "@meshsdk/core";\n\n`;
  code += `const changeAddress = await wallet.getChangeAddress();\n`;
  code += `const utxos = await wallet.getUtxos();\n\n`;
  code += `const meshTxBody: Partial<MeshTxBuilderBody> = {\n`;
  code += `  outputs: [\n`;
  code += `    {\n`;
  code += `      address: "${address}",\n`;
  code += `      amount: [{ unit: "lovelace", quantity: "${amount}" }],\n`;
  code += `    },\n`;
  code += `  ],\n`;
  code += `  changeAddress: changeAddress,\n`;
  code += `  extraInputs: utxos,\n`;
  code += `  selectionConfig: {\n`;
  code += `    threshold: "5000000",\n`;
  code += `    strategy: "largestFirst",\n`;
  code += `    includeTxFees: true,\n`;
  code += `  },\n`;
  code += `};\n`;
  code += `\n`;
  code += txbuilderCode;
  code += `const unsignedTx = await txBuilder.complete(meshTxBody);\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <LiveCodeDemo
      title="Send Lovelace"
      subtitle="Send lovelace to a recipient"
      code={code}
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
