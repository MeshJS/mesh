import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function SwapAcceptSwap() {
  return (
    <TwoColumnsScroll
      sidebarTo="acceptSwap"
      title="Accept Swap"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        User B can accept a swap by providing the swap transaction hash to the
        contract.
      </p>
      <p>
        <code>acceptSwap()</code> accept a swap. The function accepts the
        following parameters:
      </p>
      <ul>
        <li>
          <b>swapUtxo (UTxO)</b> - the utxo of the transaction in the script for
          the swap
        </li>
      </ul>
      <p>
        The function accepts a swap transaction hash and returns a transaction
        hash if the swap is successfully accepted.
      </p>
      <p>
        A{" "}
        <Link href="https://preprod.cardanoscan.io/transaction/e266fc6b0b2481988f9742a28b914dabf7da5403a3893d5ba4b05530d2519f3a">
          successful transaction
        </Link>{" "}
        will send the assets to the wallet that signed the transaction to accept
        the swap.
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

    if (utxo === undefined) throw new Error("UTxO not found");

    const tx = await contract.acceptSwap(utxo);
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash('${userInput}');\n\n`;
  code += `const tx = await contract.acceptSwap(utxo);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <LiveCodeDemo
      title="Accept Swap"
      subtitle="Accept a swap by providing the assets to the swap contract"
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
