import { useState } from "react";
import Link from "~/components/link/link";

import {
  deserializePoolId,
  resolveStakeKeyHash,
  Transaction,
} from "@meshsdk/core";
import { CSLSerializer } from "@meshsdk/core-csl";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoPool } from "~/data/cardano";
import { getTxBuilder } from "../common";

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
  let codeSnippet = `txBuilder\n`;
  codeSnippet += `  .registerStakeCertificate(stakeKeyHash)\n`;
  codeSnippet += `  .delegateStakeCertificate(stakeKeyHash, poolIdHash)\n`;

  let utilsSnippet = ``;
  utilsSnippet += `const stakeKeyHash = resolveStakeKeyHash(\n`;
  utilsSnippet += `  "stake_test1up64x8a7re5tz856zrdmch0c38k74y3jt2zmwk9mh7rntkgs6zxjp",\n`;
  utilsSnippet += `);\n`;
  utilsSnippet += `const poolIdHash = deserializePoolId(\n`;
  utilsSnippet += `  "pool107k26e3wrqxwghju2py40ngngx2qcu48ppeg7lk0cm35jl2aenx",\n`;
  utilsSnippet += `);\n`;

  return (
    <>
      <p>
        Same as{" "}
        <Link href="apis/transaction/staking#register-stake">Transaction</Link>,
        with <code>MeshTxBuilder</code> you have to register a stake address
        before delegate to stakepools. Here's the 2 APIs you need:
      </p>
      <Codeblock data={codeSnippet} />

      <p>
        Since we need to provide the deserilized hashes of the stake key and
        pool id, we can use the following utils to get them:
      </p>
      <Codeblock data={utilsSnippet} />
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
    const stakeKeyHash = resolveStakeKeyHash(rewardAddress);
    const poolIdHash = deserializePoolId(userInput);

    if (rewardAddress === undefined) {
      throw "No address found";
    }

    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .registerStakeCertificate(stakeKeyHash)
      .delegateStakeCertificate(stakeKeyHash, poolIdHash)
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
  code += `const stakeKeyHash = resolveStakeKeyHash(rewardAddress);\n`;
  code += `const poolIdHash = deserializePoolId("${userInput}");\n`;
  code += `\n`;
  code += `if (rewardAddress === undefined) {\n`;
  code += `  throw "No address found";\n`;
  code += `}\n`;
  code += `\n`;
  code += `const txBuilder = getTxBuilder();\n`;
  code += `\n`;
  code += `const unsignedTx = await txBuilder\n`;
  code += `  .registerStakeCertificate(stakeKeyHash)\n`;
  code += `  .delegateStakeCertificate(stakeKeyHash, poolIdHash)\n`;
  code += `  .selectUtxosFrom(utxos)\n`;
  code += `  .changeAddress(address)\n`;
  code += `  .complete();\n`;
  code += `\n`;
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
