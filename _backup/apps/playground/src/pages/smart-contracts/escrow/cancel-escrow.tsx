import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function EscrowCancelEscrow() {
  return (
    <TwoColumnsScroll
      sidebarTo="cancelEscrow"
      title="Cancel Escrow"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        A user can cancel an escrow if the other party fails to fulfill the
        terms of the agreement. Cancel can be initiated by any users who have
        partcipated in the escrow and can be done at any time before complete.
        Canceling the escrow will return the assets to the respective users.
      </p>
      <p>
        <code>cancelEscrow()</code> cancel an escrow. The function accepts the
        following parameters:
      </p>
      <ul>
        <li>
          <b>escrowUtxo (UTxO)</b> - the utxo of the transaction to be canceled
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

  async function runDemo() {
    const contract = getContract(wallet);

    const utxo = await contract.getUtxoByTxHash(userInput);

    if (utxo === undefined) {
      throw new Error("UTxO not found");
    }

    const tx = await contract.cancelEscrow(utxo);
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = `const utxo = await contract.getUtxoByTxHash('${userInput}');\n\n`;
  code += `const tx = await contract.cancelEscrow(utxo);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Cancel Escrow"
      subtitle="Any users who have partcipated in the escrow and can cancel the trade at any time before complete."
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
        ]}
      />
    </LiveCodeDemo>
  );
}
