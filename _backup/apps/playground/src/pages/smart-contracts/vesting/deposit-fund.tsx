import { useState } from "react";

import { Asset } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAddresses } from "~/data/cardano";
import { getContract } from "./common";

export default function VestingDepositFund() {
  return (
    <TwoColumnsScroll
      sidebarTo="depositFund"
      title="Deposit Fund"
      leftSection={Left()}
      rightSection={VestingDepositFundDemo()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        After the lockup period has expired, the beneficiary can withdraw the
        funds from the vesting contract.
      </p>
      <p>
        <code>withdrawFund()</code> withdraw funds from a vesting contract. The
        function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>vestingUtxo (UTxO)</b> - unspent transaction output in the script
        </li>
      </ul>
    </>
  );
}

export function VestingDepositFundDemo() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("5000000");
  const [userInput2, setUserInput2] = useState<string>(demoAddresses.testnet);

  async function runDemo() {
    const contract = getContract(wallet);

    const assets: Asset[] = [
      {
        unit: "lovelace",
        quantity: userInput,
      },
    ];

    const lockUntilTimeStamp = new Date();
    lockUntilTimeStamp.setMinutes(lockUntilTimeStamp.getMinutes() + 1);

    const beneficiary = userInput2;

    const tx = await contract.depositFund(
      assets,
      lockUntilTimeStamp.getTime(),
      beneficiary,
    );
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const assets: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: "lovelace",\n`;
  code += `    quantity: '${userInput}',\n`;
  code += `  },\n`;
  code += `];\n`;
  code += `\n`;
  code += `const lockUntilTimeStamp = new Date();\n`;
  code += `lockUntilTimeStamp.setMinutes(lockUntilTimeStamp.getMinutes() + 1);\n`;
  code += `\n`;
  code += `const beneficiary = '${userInput2}';\n`;
  code += `\n`;
  code += `const tx = await contract.depositFund(\n`;
  code += `  assets,\n`;
  code += `  lockUntilTimeStamp.getTime(),\n`;
  code += `  beneficiary,\n`;
  code += `);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Deposit Fund"
      subtitle="Deposit funds into a vesting contract with a locking period for a beneficiary"
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
            placeholder="Amount in lovelace"
            label="Amount in lovelace"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Beneficiary address"
            label="Beneficiary address"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
