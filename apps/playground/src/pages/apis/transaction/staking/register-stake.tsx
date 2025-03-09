import { useState } from "react";

import { Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoPool } from "~/data/cardano";

export default function StakingRegister() {
  return (
    <TwoColumnsScroll
      sidebarTo="registerStake"
      title="Register Stake Address"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;

  codeSnippet += `const addresses = await wallet.getRewardAddresses();\n`;
  codeSnippet += `const rewardAddress = addresses[0];\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.registerStake(rewardAddress);\n`;
  codeSnippet += `tx.delegateStake(rewardAddress, '${demoPool}');\n\n`;

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  let code2 = ``;
  code2 += `{\n`;
  code2 += `  "active": true,\n`;
  code2 += `  "poolId": "${demoPool}",\n`;
  code2 += `  "balance": "389290551",\n`;
  code2 += `  "rewards": "0",\n`;
  code2 += `  "withdrawals": "0"\n`;
  code2 += `}\n`;

  return (
    <>
      <p>
        New address must "register" before they can delegate to stakepools. To
        check if a reward address has been register, use{" "}
        <Link href="/providers/blockfrost#fetchAccountInfo">
          provider.fetchAccountInfo(rewardAddress)
        </Link>
        . For example this account information, <code>active</code> shows the
        address is registered.
      </p>
      <Codeblock data={code2} />
      <p>
        You can chain with <code>delegateStake()</code> to register and delegate
        to a stake pool.
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
    tx.registerStake(rewardAddress);
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
  code += `tx.registerStake(rewardAddress);\n`;
  code += `tx.delegateStake(rewardAddress, '${userInput}');\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Register Stake Address"
      subtitle="Register a stake address before delegate to stakepools."
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
