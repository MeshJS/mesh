import { useState } from "react";

import { Asset } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function EscrowInitiateEscrow() {
  return (
    <TwoColumnsScroll
      sidebarTo="initiateEscrow"
      title="Initiate Escrow"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        An escrow is initiated by one of the party, user A, by locking assets to
        the escrow contract.
      </p>
      <p>
        <code>initiateEscrow()</code> initiate an escrow. The function accepts
        the following parameters:
      </p>
      <ul>
        <li>
          <b>escrowAmount (Asset[])</b> - a list of assets user A is trading
        </li>
      </ul>
      <p>
        The function returns a transaction hex if the escrow is successfully
        initiated.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("10000000");

  async function runDemo() {
    const contract = getContract(wallet);

    const escrowAmount: Asset[] = [
      {
        unit: "lovelace",
        quantity: userInput,
      },
    ];

    const tx = await contract.initiateEscrow(escrowAmount);
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const escrowAmount: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: "lovelace",\n`;
  code += `    quantity: '${userInput}',\n`;
  code += `  },\n`;
  code += `];\n`;
  code += `\n`;
  code += `const tx = await contract.initiateEscrow(escrowAmount);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Initiate Escrow"
      subtitle="Initiate an escrow, in this demo, person A is initiating the escrow and deposit ADA."
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
