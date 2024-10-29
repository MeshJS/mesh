import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import {
  getContract,
  InputsOperationAddress,
  InputsParamUtxo,
  useContentOwnership,
} from "./common";

export default function OwnershipSetupOracleUtxo() {
  return (
    <TwoColumnsScroll
      sidebarTo="setupOracleUtxo"
      title="Setup Oracle Utxo"
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
  const paramUtxo = useContentOwnership((state) => state.paramUtxo);

  async function runDemo() {
    const contract = getContract(
      wallet,
      operationAddress,
      JSON.parse(paramUtxo) as { outputIndex: number; txHash: string },
    );
    const tx = await contract.setupOracleUtxo();
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.setupOracleUtxo();\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Setup Oracle Utxo"
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
      <InputsParamUtxo />
    </LiveCodeDemo>
  );
}
