import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import {
  getContract,
  InputsOperationAddress,
  InputsParamUtxo,
  InputsRefScriptUtxos,
  useContentOwnership,
} from "./common";

export default function OwnershipGetOracleData() {
  return (
    <TwoColumnsScroll
      sidebarTo="getOracleData"
      title="Get Oracle Data"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeOracle = ``;
  codeOracle += `const oracleData = await contract.getOracleData();\n`;
  let codeExample = `{\n`;
  codeExample += `  "contentNumber": 2,\n`;
  codeExample += `  "ownershipNumber": 2\n`;
  codeExample += `}\n`;

  return (
    <>
      <p>
        Getting the oracle data is essential to fetch the current state of the
        registry.
      </p>
      <p>
        To facilitate this process, you must provide the <code>paramUtxo</code>{" "}
        that contains the output index and transaction hash of the NFT minting
        policy.
      </p>
      <p>
        The <code>getOracleData()</code> function will return the current oracle
        data.
      </p>
      <Codeblock data={codeOracle} />
      <p>For example:</p>
      <Codeblock data={codeExample} />
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
    const oracleData = await contract.getOracleData();
    return oracleData;
  }

  let code = ``;
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
