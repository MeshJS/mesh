import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function GiftcardRedeem() {
  return (
    <TwoColumnsScroll
      sidebarTo="redeemGiftCard"
      title="Redeem Giftcard"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>redeemGiftCard()</code> redeem a gift card. The function accepts
        the following parameters:
      </p>
      <ul>
        <li>
          <b>giftCardUtxo (UTxO)</b> - unspent transaction output in the script
        </li>
      </ul>
      <p>
        The function returns a transaction hash if the gift card is successfully
        redeemed. It will burn the gift card and transfer the value to the
        wallet signing this transaction.
      </p>
      <p>
        The function returns a transaction hex if the gift card has been
        redeemed successfully.
      </p>
      <p>
        We have provided a very handle function, <code>getUtxoByTxHash</code>,
        which will return the UTxO object for a given transaction hash. You can
        always create another function that searches by token name.
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

    const tx = await contract.redeemGiftCard(utxo);
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash('${userInput}');\n`;
  code += `\n`;
  code += `const tx = await contract.redeemGiftCard(utxo);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Redeem Giftcard"
      subtitle="Redeem a gift card given the gift card UTxO"
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
