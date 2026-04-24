import {
  deserializeAddress,
  resolveScriptHash,
  serializeRewardAddress,
  utxoToTxIn,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { alwaysSucceedMintingStakingScriptCbor } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

export default function StakingWithdraw() {
  return (
    <TwoColumnsScroll
      sidebarTo="scriptWithdrawal"
      title="Script Withdrawal - Supporting Withdraw Zero"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeWithdraw = `txBuilder\n`;
  codeWithdraw += `   .withdrawalPlutusScriptV2()\n`;
  codeWithdraw += `   .withdrawal(rewardAddress, withdrawalAmount)\n`;
  codeWithdraw += `   .withdrawalScript(stakeScriptCbor)\n`;
  codeWithdraw += `   .withdrawalRedeemerValue(redeemer)\n`;
  let codeRegister = `txBuilder\n  .registerStakeCertificate(stakeScriptHash)`; // TODO
  let codeWithdraw0 = `txBuilder\n`;
  codeWithdraw0 += `  .withdrawalPlutusScriptV2()\n`;
  codeWithdraw0 += `  .withdrawal(rewardAddress, "0")\n`;
  codeWithdraw0 += `  .withdrawalScript(stakeScriptCbor)\n`;
  codeWithdraw0 += `  .withdrawalRedeemerValue(redeemer)\n`;

  return (
    <>
      <p>
        Withdrawal from script is supported by <code>MeshTxBuilder</code> with
        this set of APIs:
      </p>
      <Codeblock data={codeWithdraw} />

      <h3>Withdraw Zero</h3>
      <p>
        With that capability, it supports a Cardano technique - withdraw zero -
        which is a technique to trigger withdrawal script validation without
        actually withdrawing any value. This is a technique to help boost script
        ExUnits performance especially comes to validating multiple script
        inputs. In order to perform withdraw zero, 2 steps are involved:
      </p>
      <ul>
        <li>
          Register script stake key
          <Codeblock data={codeRegister} />
        </li>
        <li>Withdraw Zero</li>
        <Codeblock data={codeWithdraw0} />
      </ul>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runRegisterDemo() {
    const utxos = await wallet.getUtxos();
    const address = await wallet.getChangeAddress();
    const txBuilder = getTxBuilder();
    const stakeScriptCbor = alwaysSucceedMintingStakingScriptCbor(
      deserializeAddress(address).pubKeyHash,
    );
    const stakeScriptHash = resolveScriptHash(stakeScriptCbor, "V2");
    const rewardAddress = serializeRewardAddress(stakeScriptHash, true, 0);
    console.log("rewardAddress", rewardAddress);

    const unsignedTx = await txBuilder
      .registerStakeCertificate(rewardAddress)
      .selectUtxosFrom(utxos)
      .changeAddress(address)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const collateral = await wallet.getCollateral();
    const address = await wallet.getChangeAddress();
    const stakeScriptCbor = alwaysSucceedMintingStakingScriptCbor(
      deserializeAddress(address).pubKeyHash,
    );
    const stakeScriptHash = resolveScriptHash(stakeScriptCbor, "V2");
    const rewardAddress = serializeRewardAddress(stakeScriptHash, true, 0);

    const txBuilder = getTxBuilder();
    const unsignedTx = await txBuilder
      .withdrawalPlutusScriptV2()
      .withdrawal(rewardAddress, "0")
      .withdrawalScript(stakeScriptCbor)
      .withdrawalRedeemerValue("")
      .selectUtxosFrom(utxos)
      .changeAddress(address)
      .txInCollateral(...utxoToTxIn(collateral[0]!))
      .complete();

    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeRegister = ``;
  codeRegister += `const utxos = await wallet.getUtxos();\n`;
  codeRegister += `const address = await wallet.getChangeAddress();\n`;
  codeRegister += `const txBuilder = getTxBuilder();\n`;
  codeRegister += `const stakeScriptCbor = alwaysSucceedMintingStakingScriptCbor(\n`;
  codeRegister += `  deserializeAddress(address).pubKeyHash,\n`;
  codeRegister += `);\n\n`;
  codeRegister += txbuilderCode;
  codeRegister += `const unsignedTx = await txBuilder\n`;
  codeRegister += `  .registerStakeCertificate(resolveScriptHash(stakeScriptCbor, "V2"))\n`;
  codeRegister += `  .selectUtxosFrom(utxos)\n`;
  codeRegister += `  .changeAddress(address)\n`;
  codeRegister += `  .complete();\n`;
  codeRegister += `\n`;
  codeRegister += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeRegister += `const txHash = await wallet.submitTx(signedTx);\n`;

  let codeWithdraw0 = ``;
  codeWithdraw0 += `const utxos = await wallet.getUtxos();\n`;
  codeWithdraw0 += `const collateral = await wallet.getCollateral();\n`;
  codeWithdraw0 += `const address = await wallet.getChangeAddress();\n`;
  codeWithdraw0 += `const stakeScriptCbor = alwaysSucceedMintingStakingScriptCbor(\n`;
  codeWithdraw0 += `  deserializeAddress(address).pubKeyHash,\n`;
  codeWithdraw0 += `);\n`;
  codeWithdraw0 += `const rewardAddress = serializeRewardAddress(\n`;
  codeWithdraw0 += `  resolveScriptHash(stakeScriptCbor, "V2"),\n`;
  codeWithdraw0 += `  true,\n`;
  codeWithdraw0 += `  0,\n`;
  codeWithdraw0 += `);\n`;
  codeWithdraw0 += `\n`;
  codeWithdraw0 += txbuilderCode;
  codeWithdraw0 += `const unsignedTx = await txBuilder\n`;
  codeWithdraw0 += `  .withdrawalPlutusScriptV2()\n`;
  codeWithdraw0 += `  .withdrawal(rewardAddress, "0")\n`;
  codeWithdraw0 += `  .withdrawalScript(stakeScriptCbor)\n`;
  codeWithdraw0 += `  .withdrawalRedeemerValue("")\n`;
  codeWithdraw0 += `  .selectUtxosFrom(utxos)\n`;
  codeWithdraw0 += `  .changeAddress(address)\n`;
  codeWithdraw0 += `  .txInCollateral(...utxoToTxIn(collateral[0]!))\n`;
  codeWithdraw0 += `  .complete();\n`;
  codeWithdraw0 += `\n`;
  codeWithdraw0 += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeWithdraw0 += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <LiveCodeDemo
        title="Register Script Stake Key"
        subtitle="One off setup before triggering withdraw zero"
        runCodeFunction={runRegisterDemo}
        disabled={!connected}
        runDemoButtonTooltip={
          !connected ? "Connect wallet to run this demo" : undefined
        }
        runDemoShowBrowseWalletConnect={true}
        code={codeRegister}
      />
      <LiveCodeDemo
        title="Withdraw Zero"
        subtitle="Actual withdrawal of zero to trigger script validation"
        runCodeFunction={runDemo}
        disabled={!connected}
        runDemoButtonTooltip={
          !connected ? "Connect wallet to run this demo" : undefined
        }
        runDemoShowBrowseWalletConnect={true}
        code={codeWithdraw0}
      />
    </>
  );
}
