import { resolveStakeKeyHash, Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder } from "../common";

export default function StakingDeregister() {
  return (
    <TwoColumnsScroll
      sidebarTo="deregisterStake"
      title="Deregister Stake"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSnippet = `txBuilder\n  .deregisterStakeCertificate(stakeKeyHash: string)`;

  return (
    <>
      <p>
        Deregister a stake address. The function accepts the following
        parameters:
      </p>
      <ul>
        <li>
          <b>stakeKeyHash (string)</b> - the hash of stake key to deregister
        </li>
      </ul>
      <Codeblock data={codeSnippet} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const address = await wallet.getChangeAddress();
    const addresses = await wallet.getRewardAddresses();
    const rewardAddress = addresses[0]!;
    const stakeKeyHash = resolveStakeKeyHash(rewardAddress);

    if (rewardAddress === undefined) {
      throw "No address found";
    }

    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .deregisterStakeCertificate(stakeKeyHash)
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
  code += `\n`;
  code += `if (rewardAddress === undefined) {\n`;
  code += `  throw "No address found";\n`;
  code += `}\n`;
  code += `\n`;
  code += `const txBuilder = getTxBuilder();\n`;
  code += `\n`;
  code += `const unsignedTx = await txBuilder\n`;
  code += `  .deregisterStakeCertificate(stakeKeyHash)\n`;
  code += `  .selectUtxosFrom(utxos)\n`;
  code += `  .changeAddress(address)\n`;
  code += `  .complete();\n`;
  code += `\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Deregister Stake"
      subtitle="Deregister a stake address"
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
      code={code}
    ></LiveCodeDemo>
  );
}