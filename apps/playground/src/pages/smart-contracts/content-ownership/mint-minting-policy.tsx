import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import {
  getContract,
  InputsOperationAddress,
  useContentOwnership,
} from "./common";

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

  async function runDemo() {
    const contract = getContract(wallet, operationAddress);
    const { tx, paramUtxo } = await contract.mintOneTimeMintingPolicy();
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return { txHash, paramUtxo };
  }

  let code = ``;
  code += `const { tx, paramUtxo } = await contract.mintOneTimeMintingPolicy();\n`;
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
      <InputsOperationAddress />
    </LiveCodeDemo>
  );
}
