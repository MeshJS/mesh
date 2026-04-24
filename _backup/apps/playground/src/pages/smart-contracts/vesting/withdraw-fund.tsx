import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function VestingWithdrawFund() {
  return (
    <TwoColumnsScroll
      sidebarTo="withdrawFund"
      title="Withdraw Fund"
      leftSection={Left()}
      rightSection={VestingWithdrawFundDemo()}
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
      <p>
        A{" "}
        <Link href="https://preprod.cardanoscan.io/transaction/e61815bcfe46ababf3d024ae470f779fa738cded55f02127b9e211847c77af8b">
          successful withdrawal
        </Link>{" "}
        will send the funds to the wallet that signed the transaction to
        withdraw the funds.
      </p>
    </>
  );
}

export function VestingWithdrawFundDemo() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("");

  async function runDemo() {
    const contract = getContract(wallet);

    const utxo = await contract.getUtxoByTxHash(userInput);

    if (utxo === undefined) throw new Error("UTxO not found");

    const tx = await contract.withdrawFund(utxo);
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash('${userInput}');\n\n`;
  code += `const tx = await contract.withdrawFund(utxo);\n`;
  code += `const signedTx = await wallet.signTx(tx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Withdraw Fund"
      subtitle="Withdraw funds from a vesting contract"
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
