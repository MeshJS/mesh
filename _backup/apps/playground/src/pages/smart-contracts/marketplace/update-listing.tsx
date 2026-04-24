import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function MarketplaceUpdateListing() {
  return (
    <TwoColumnsScroll
      sidebarTo="updateListing"
      title="Update Listing"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Update a listing on the marketplace. For the contract, the seller can
        update the listing price.
      </p>
      <p>
        <code>relistAsset()</code> update a listing on the marketplace. The
        function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>utxo (UTxO)</b> - unspent transaction output in the script
        </li>
        <li>
          <b>newListPrice (number)</b> - the new listing price in Lovelace
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
  const [userInput2, setUserInput2] = useState<string>("20000000");

  async function runDemo() {
    const contract = getContract(wallet);

    const utxo = await contract.getUtxoByTxHash(userInput);

    if (utxo === undefined) throw new Error("UTxO not found");

    const tx = await contract.relistAsset(utxo, parseInt(userInput2));
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash('${userInput}');\n\n`;
  code += `const tx = await contract.relistAsset(utxo, ${userInput2});\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Update Listing"
      subtitle="Update the listing price of an asset on the marketplace"
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
            placeholder="New listing price in Lovelace"
            label="New listing price in Lovelace"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
