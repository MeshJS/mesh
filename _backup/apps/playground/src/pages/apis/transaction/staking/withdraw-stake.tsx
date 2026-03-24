import { useState } from "react";

import { Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function StakingWithdraw() {
  return (
    <TwoColumnsScroll
      sidebarTo="withdrawRewards"
      title="Withdraw Rewards"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSnippet = `tx.withdrawRewards(rewardAddress, lovelace);`;

  return (
    <>
      <p>
        Withdraw staking rewards. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>rewardAddress (string)</b> - the reward address to withdraw from
        </li>
        <li>
          <b>lovelace (number)</b> - the amount to withdraw in Lovelace
        </li>
      </ul>
      <Codeblock data={codeSnippet} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("1000000");

  async function runDemo() {
    const addresses = await wallet.getRewardAddresses();
    const rewardAddress = addresses[0];

    if (rewardAddress === undefined) {
      throw "No address found";
    }

    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.withdrawRewards(rewardAddress, userInput);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const addresses = await wallet.getRewardAddresses();\n`;
  code += `const rewardAddress = addresses[0];\n`;
  code += `\n`;
  code += `const tx = new Transaction({ initiator: wallet });\n`;
  code += `tx.withdrawRewards(rewardAddress, '${userInput}');\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Withdraw Reward"
      subtitle="Withdraw staking rewards."
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
      code={code}
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
        ]}
      />
    </LiveCodeDemo>
  );
}
