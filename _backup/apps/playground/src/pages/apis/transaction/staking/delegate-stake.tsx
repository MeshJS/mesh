import { useState } from "react";

import { Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoPool } from "~/data/cardano";

export default function StakingDelegate() {
  return (
    <TwoColumnsScroll
      sidebarTo="delegateStake"
      title="Delegate Stake"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSnippet = `const addresses = await wallet.getRewardAddresses();\n`;
  codeSnippet += `const rewardAddress = addresses[0];\n\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.delegateStake(rewardAddress, '${demoPool}');`;

  return (
    <>
      <p>
        Delegation is the process by which ADA holders delegate the stake
        associated with their ADA to a stake pool. Doing so, this allows ADA
        holders to participate in the network and be rewarded in proportion to
        the amount of stake delegated.
      </p>
      <Codeblock data={codeSnippet} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>(demoPool);

  async function runDemo() {
    const addresses = await wallet.getRewardAddresses();
    const rewardAddress = addresses[0];

    if (rewardAddress === undefined) {
      throw "No address found";
    }

    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.delegateStake(rewardAddress, userInput);

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
  code += `tx.delegateStake(rewardAddress, '${userInput}');\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Delegate Stake"
      subtitle="Delegate stake to a stake pool"
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
            placeholder="Pool ID"
            label="Pool ID"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
