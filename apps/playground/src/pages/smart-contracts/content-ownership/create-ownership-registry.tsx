import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract, useContentOwnership } from "./common";

export default function OwnershipCreateOwnershipRegistry() {
  return (
    <TwoColumnsScroll
      sidebarTo="createOwnershipRegistry"
      title="Create Ownership Registry"
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
      JSON.parse(paramUtxo) as { outputIndex: number; txHash: string },
    );
    const tx = await contract.createContentRegistry();
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.createContentRegistry();\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Create Ownership Registry"
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
