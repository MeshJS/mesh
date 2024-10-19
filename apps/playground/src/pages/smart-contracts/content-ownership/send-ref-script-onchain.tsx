import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAddresses } from "~/data/cardano";
import { getContract, sampleParamUtxo, useContentOwnership } from "./common";

export default function OwnershipSendRefScriptOnchain() {
  return (
    <TwoColumnsScroll
      sidebarTo="sendRefScriptOnchain"
      title="Send Ref Script Onchain"
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
  const paramUtxo = useContentOwnership((state) => state.paramUtxo);
  const setParamUtxo = useContentOwnership((state) => state.setParamUtxo);

  async function runDemo() {
    const contract = getContract(
      wallet,
      operationAddress,
      JSON.parse(paramUtxo),
    );
    // "OracleNFT" | "OracleValidator" | "ContentRegistry" | "ContentRefToken" | "OwnershipRegistry" | "OwnershipRefToken"
    const tx = await contract.sendRefScriptOnchain("OracleNFT");
    const signedTx = await wallet.signTx(tx);
    console.log("signedTx", signedTx);
    // const txHash = await wallet.submitTx(signedTx);
    const blockchainProvider = getProvider();
    const txHash = await blockchainProvider.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.mintOneTimeMintingPolicy();\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Send Ref Script Onchain"
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
          <Input
            value={paramUtxo}
            onChange={(e) => setParamUtxo(e.target.value)}
            placeholder="{outputIndex: 0, txHash: '...'}"
            label="Param UTxO"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
