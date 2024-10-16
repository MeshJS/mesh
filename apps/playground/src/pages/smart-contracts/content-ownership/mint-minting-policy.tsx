import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

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
  const [userInput, setUserInput] = useState<string>("10000000");

  async function runDemo() {
    console.log(33232);

    const contract = getContract(wallet);
    const { tx, paramUtxo } = await contract.mintOneTimeMintingPolicy();
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    console.log(1, "txHash", txHash);
    console.log(2, "paramUtxo", paramUtxo, JSON.stringify(paramUtxo));
    return txHash;
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
    ></LiveCodeDemo>
  );
}
