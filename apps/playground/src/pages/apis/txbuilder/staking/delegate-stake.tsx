import { useState } from "react";

import { keepRelevant, MeshTxBuilder, Quantity, Unit } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";

export default function TxbuilderSendValues() {
  return (
    <TwoColumnsScroll
      sidebarTo="sendValues"
      title="Send Values"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = ``;
  code1 += `const txBuilder = new MeshTxBuilder({\n`;
  code1 += `  fetcher: blockchainProvider,\n`;
  code1 += `});\n`;
  code1 += `\n`;
  code1 += `const unsignedTx = await txBuilder\n`;
  code1 += `  .txIn(utxo.input.txHash, utxo.input.outputIndex)\n`;
  code1 += `  .txOut(address, [{ unit: "lovelace", quantity: '1000000' }])\n`;
  code1 += `  .changeAddress(await wallet.getChangeAddress())\n`;
  code1 += `  .complete();\n`;

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
    const blockchainProvider = getProvider();

    // get utxo
    const assetMap = new Map<Unit, Quantity>();
    assetMap.set("lovelace", amount);

    const walletUtxos = await wallet.getUtxos();
    const utxos = keepRelevant(assetMap, walletUtxos);
    const utxo = utxos[0];

    if (utxo === undefined) {
      throw new Error("No utxo found");
    }

    // transaction
    const txBuilder = new MeshTxBuilder({
      fetcher: blockchainProvider,
    });

    const unsignedTx = await txBuilder
      .txIn(utxo.input.txHash, utxo.input.outputIndex)
      .txOut(address, [{ unit: "lovelace", quantity: amount }])
      .changeAddress(await wallet.getChangeAddress())
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = `import { keepRelevant, MeshTxBuilder, Quantity, Unit } from "@meshsdk/core";\n\n`;

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
