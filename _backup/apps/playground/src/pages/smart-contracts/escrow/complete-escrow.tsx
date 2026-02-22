import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function EscrowCompleteEscrow() {
  return (
    <TwoColumnsScroll
      sidebarTo="completeEscrow"
      title="Complete Escrow"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        A user can complete an escrow if the terms of the agreement are met. The
        completion can be initiated by any recipient of the escrow.
      </p>
      <p>
        <code>completeEscrow()</code> complete an escrow. The function accepts
        the following parameters:
      </p>
      <ul>
        <li>
          <b>escrowUtxo (UTxO)</b> - the utxo of the transaction in the script
          to be completed
        </li>
      </ul>
      <p>
        <b>
          Important: This is a multi-signature transaction. Both users must sign
          the transaction to complete the escrow.
        </b>
      </p>
      <p>
        A{" "}
        <Link href="https://preprod.cardanoscan.io/transaction/019b6ba41ee0a9de90068fe5c1eb1fd81489be5d2402bd560b548e1cd7f22056">
          successful completion of the escrow
        </Link>{" "}
        will result in the assets being swapped between the two parties.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("");
  const [userInput2, setUserInput2] = useState<string>("");

  async function runDemo() {
    const contract = getContract(wallet);

    const utxo = await contract.getUtxoByTxHash(userInput);

    if (utxo === undefined) {
      throw new Error("UTxO not found");
    }

    const tx = await contract.completeEscrow(utxo);

    const signedTx = await wallet.signTx(tx, true);

    return signedTx;
  }

  async function runDemo2() {
    const signedTx = await wallet.signTx(userInput2, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash('${userInput}');\n`;
  code += `const tx = await contract.completeEscrow(utxo);\n`;
  code += `const signedTxUserA = await wallet.signTx(tx, true);\n`;

  let code2 = ``;
  code2 += `const signedTxUserB = await wallet.signTx(signedTxUserA, true);\n`;
  code2 += `const txHash = await wallet.submitTx(signedTxUserB);\n`;

  return (
    <>
      <LiveCodeDemo
        title="Person A signs the transaction"
        subtitle="User A completes the escrow by calling the `completeEscrow()`
            function and partial sign the transaction."
        runCodeFunction={runDemo}
        code={code}
        disabled={!connected}
        runDemoButtonTooltip={
          !connected ? "Connect wallet to run this demo" : undefined
        }
        runDemoShowBrowseWalletConnect={true}
      >
        <>
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
        </>
      </LiveCodeDemo>

      <LiveCodeDemo
        title="Person B signs and submits the transaction"
        subtitle="The signed transaction will be handled to User B to sign the
        transaction and submits it to the blockchain to complete the escrow."
        runCodeFunction={runDemo2}
        code={code2}
        disabled={!connected}
        runDemoButtonTooltip={
          !connected ? "Connect wallet to run this demo" : undefined
        }
        runDemoShowBrowseWalletConnect={true}
      >
        <>
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
                placeholder="Transaction CBOR"
                label="Transaction CBOR"
                key={0}
              />,
            ]}
          />
        </>
      </LiveCodeDemo>
    </>
  );
}
