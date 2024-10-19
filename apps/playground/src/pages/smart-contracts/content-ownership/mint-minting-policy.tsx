import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAddresses } from "~/data/cardano";
import { getContract, sampleParamUtxo, useContentOwnership } from "./common";

export default function OwnershipMintMintingPolicy() {
  return (
    <TwoColumnsScroll
      sidebarTo="mintOneTimeMintingPolicy"
      title="Mint One Time Minting Policy"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p></p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const operationAddress = useContentOwnership(
    (state) => state.operationAddress,
  );
  const setOperationAddress = useContentOwnership(
    (state) => state.setOperationAddress,
  );

  async function runDemo() {
    const contract = getContract(wallet, operationAddress);
    const { tx, paramUtxo } = await contract.mintOneTimeMintingPolicy();
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    console.log(2, "paramUtxo", JSON.stringify(paramUtxo));
    return { txHash };
  }

  let code = ``;
  code += `const tx = await contract.mintOneTimeMintingPolicy();\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Mint One Time Minting Policy"
      subtitle=""
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
            value={operationAddress}
            onChange={(e) => setOperationAddress(e.target.value)}
            placeholder="addr1..."
            label="Operation address"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
