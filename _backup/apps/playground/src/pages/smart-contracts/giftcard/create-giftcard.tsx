import { useState } from "react";

import { Asset } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function GiftcardCreate() {
  return (
    <TwoColumnsScroll
      sidebarTo="createGiftCard"
      title="Create Giftcard"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>createGiftCard()</code> create a gift card. The function accepts
        the following parameters:
      </p>
      <ul>
        <li>
          <b>tokenName (string)</b> - name of the token
        </li>
        <li>
          <b>giftValue (Asset[])</b> - a list of assets
        </li>
      </ul>
      <p>
        The function returns a transaction hash if the gift card is successfully
        created.
      </p>
      <p>
        The function returns a transaction hex if giftcard has been created
        successfully.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("10000000");
  const [userInput2, setUserInput2] = useState<string>("Mesh_Gift_Card");

  async function runDemo() {
    const contract = getContract(wallet);

    const giftValue: Asset[] = [
      {
        unit: "lovelace",
        quantity: userInput,
      },
    ];

    const tx = await contract.createGiftCard(userInput2, giftValue);
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const giftValue: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: "lovelace",\n`;
  code += `    quantity: '${userInput}',\n`;
  code += `  },\n`;
  code += `];\n`;
  code += `\n`;
  code += `const tx = await contract.createGiftCard('${userInput2}', giftValue);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Create Giftcard"
      subtitle="Create a gift card with a given amount of lovelace"
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
            placeholder="Gitfcard amount"
            label="Gitfcard amount"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Giftcard name"
            label="Giftcard name"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
