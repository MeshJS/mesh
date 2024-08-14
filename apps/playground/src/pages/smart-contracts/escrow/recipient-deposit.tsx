import { useState } from "react";

import { Asset } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAsset } from "~/data/cardano";
import { getContract } from "./common";

export default function EscrowRecipientDeposit() {
  return (
    <TwoColumnsScroll
      sidebarTo="recipientDeposit"
      title="Recipient Deposit"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        User B can deposit assets into the escrow after initiation step (
        <code>initiateEscrow()</code>).
      </p>
      <p>
        <code>recipientDeposit()</code> deposit assets into the escrow. The
        function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>escrowUtxo (UTxO)</b> - the utxo of the transaction on the contract
        </li>
        <li>
          <b>depositAmount (Asset[])</b> - a list of assets user B is trading
        </li>
      </ul>
      <p>
        We have provided a very handle function, <code>getUtxoByTxHash</code>,
        which will return the UTxO object for a given transaction hash.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("");
  const [userInput2, setUserInput2] = useState<string>(demoAsset);

  async function runDemo() {
    const contract = getContract(wallet);

    const utxo = await contract.getUtxoByTxHash(userInput);

    if (utxo === undefined) {
      throw new Error("UTxO not found");
    }

    const depositAmount: Asset[] = [
      {
        unit: userInput2,
        quantity: "1",
      },
    ];

    const tx = await contract.recipientDeposit(utxo, depositAmount);
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = `const utxo = await contract.getUtxoByTxHash('${userInput}');`;
  code += `const escrowAmount: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: '${userInput2}',\n`;
  code += `    quantity: '1',\n`;
  code += `  },\n`;
  code += `];\n`;
  code += `\n`;
  code += `const tx = await contract.initiateEscrow(escrowAmount);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Recipient Deposit"
      subtitle="Deposit funds into the escrow for trade. In this demo, person B is depositing an asset into the escrow."
      runCodeFunction={runDemo}
      code={code}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Tx hash"
            label="Tx hash"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Asset unit"
            label="Asset unit"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
