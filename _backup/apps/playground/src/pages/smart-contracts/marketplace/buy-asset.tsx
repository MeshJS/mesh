import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function MarketplaceBuyAsset() {
  return (
    <TwoColumnsScroll
      sidebarTo="buyAsset"
      title="Buy Asset"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Purchase a listed asset from the marketplace. The seller will receive
        the listed price in ADA and the buyer will receive the asset. The
        marketplace owner will receive a fee if it is specified.
      </p>
      <p>
        <code>purchaseAsset()</code> purchase a listed asset. The function
        accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>utxo (UTxO)</b> - unspent transaction output in the script
        </li>
      </ul>
      <p>
        We have provided a very handle function, <code>getUtxoByTxHash</code>,
        which will return the UTxO object for a given transaction hash.
      </p>
      <p>
        A{" "}
        <Link href="https://preprod.cardanoscan.io/transaction/f9f7ddbbbe1c34717134c89c343aaa27d4c5f62e6e8a127757400ac8d45e64e8">
          successful purchase
        </Link>{" "}
        will send the asset to the wallet that signed the transaction to
        purchase the asset.
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

    const tx = await contract.purchaseAsset(utxo);
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash('${userInput}');\n\n`;
  code += `const tx = await contract.purchaseAsset(utxo);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Buy Asset"
      subtitle="Purchase a listed asset from the marketplace"
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
