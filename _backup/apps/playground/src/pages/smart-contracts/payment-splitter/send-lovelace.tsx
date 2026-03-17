import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function PaymentSplitterSendLovelace() {
  return (
    <TwoColumnsScroll
      sidebarTo="sendLovelaceToSplitter"
      title="Send Lovelace to Payment Splitter"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>sendLovelaceToSplitter()</code> will lock Lovelace in the
        contract. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>lovelaceAmount (number)</b> - the amount of Lovelace you want to
          send to the contract
        </li>
      </ul>
      <p>The function returns a transaction hash.</p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("15000000");

  async function runDemo() {
    const contract = getContract(wallet);

    const tx = await contract.sendLovelaceToSplitter(parseInt(userInput));
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.sendLovelaceToSplitter(${userInput});\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Send Lovelace to Payment Splitter"
      subtitle="Send Lovelace to the Payment Splitter contract to be distributed to the beneficiaries."
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
            placeholder="Listing price in Lovelace"
            label="Listing price in Lovelace"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
