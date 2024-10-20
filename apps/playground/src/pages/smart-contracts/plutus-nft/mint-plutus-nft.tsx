import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract, InputsParamUtxo, usePlutusNft } from "./common";

export default function PlutusNftMint() {
  return (
    <TwoColumnsScroll
      sidebarTo="plutusNftMint"
      title="Mint Token"
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
  const paramUtxo = usePlutusNft((state) => state.paramUtxo);

  async function runDemo() {
    const contract = getContract(wallet, "mesh", JSON.parse(paramUtxo));
    const tx = await contract.mintPlutusNFT();
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.mintPlutusNFT();\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Mint Token"
      subtitle=""
      runCodeFunction={runDemo}
      code={code}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    >
      <InputsParamUtxo />
    </LiveCodeDemo>
  );
}
