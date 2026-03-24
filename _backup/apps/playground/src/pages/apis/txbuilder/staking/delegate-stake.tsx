import { useState } from "react";

import { deserializePoolId } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoPool } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

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
  let codeSnippet = `txBuilder\n`;
  codeSnippet += `  .delegateStakeCertificate(rewardAddress, poolIdHash)\n`;

  return (
    <>
      <p>
        Delegation with <code>MeshTxBuilder</code> is exactly the same as first
        delegate, but without registering stake key, so only one API is needed:
      </p>
      <Codeblock data={codeSnippet} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>(demoPool);

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const address = await wallet.getChangeAddress();
    const addresses = await wallet.getRewardAddresses();
    const rewardAddress = addresses[0]!;
    const poolIdHash = deserializePoolId(userInput);

    if (rewardAddress === undefined) {
      throw "No address found";
    }

    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .delegateStakeCertificate(rewardAddress, poolIdHash)
      .selectUtxosFrom(utxos)
      .changeAddress(address)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const utxos = await wallet.getUtxos();\n`;
  code += `const address = await wallet.getChangeAddress();\n`;
  code += `const addresses = await wallet.getRewardAddresses();\n`;
  code += `const rewardAddress = addresses[0]!;\n`;
  code += `const poolIdHash = deserializePoolId("${userInput}");\n`;
  code += `\n`;
  code += `if (rewardAddress === undefined) {\n`;
  code += `  throw "No address found";\n`;
  code += `}\n`;
  code += `\n`;
  code += txbuilderCode;
  code += `const unsignedTx = await txBuilder\n`;
  code += `  .delegateStakeCertificate(rewardAddress, poolIdHash)\n`;
  code += `  .selectUtxosFrom(utxos)\n`;
  code += `  .changeAddress(address)\n`;
  code += `  .complete();\n`;
  code += `\n`;
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
