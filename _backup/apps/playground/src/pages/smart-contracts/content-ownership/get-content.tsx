import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import {
  getContract,
  InputsOperationAddress,
  InputsParamUtxo,
  InputsRefScriptUtxos,
  useContentOwnership,
} from "./common";

export default function OwnershipGetContent() {
  return (
    <TwoColumnsScroll
      sidebarTo="getContent"
      title="Get Content"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>This transaction fetches the content data from the registry.</p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const operationAddress = useContentOwnership(
    (state) => state.operationAddress,
  );
  const paramUtxo = useContentOwnership((state) => state.paramUtxo);
  const contentRegistry = useContentOwnership((state) => state.contentRegistry);
  const contentRefToken = useContentOwnership((state) => state.contentRefToken);
  const ownershipRegistry = useContentOwnership(
    (state) => state.ownershipRegistry,
  );
  const ownershipRefToken = useContentOwnership(
    (state) => state.ownershipRefToken,
  );

  async function runDemo() {
    const refScriptUtxos = {
      contentRegistry: {
        outputIndex: 0,
        txHash: contentRegistry,
      },
      contentRefToken: {
        outputIndex: 0,
        txHash: contentRefToken,
      },
      ownershipRegistry: {
        outputIndex: 0,
        txHash: ownershipRegistry,
      },
      ownershipRefToken: {
        outputIndex: 0,
        txHash: ownershipRefToken,
      },
    };

    const contract = getContract(
      wallet,
      operationAddress,
      JSON.parse(paramUtxo) as { outputIndex: number; txHash: string },
      refScriptUtxos,
    );
    const content = await contract.getContent(0, 0);
    return content;
  }

  let code = `const content = await contract.getContent(0, 0);`;

  return (
    <LiveCodeDemo
      title="Get Oracle Data"
      subtitle="Fetch the current oracle data"
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
      <InputsRefScriptUtxos />
    </LiveCodeDemo>
  );
}
