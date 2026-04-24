import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getContract, InputsParamUtxo, usePlutusNft } from "./common";

export default function PlutusNftGetOracleData() {
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
  const paramUtxo = usePlutusNft((state) => state.paramUtxo);

  let codeInit = ``;
  codeInit += `const contract = new MeshPlutusNFTContract(\n`;
  codeInit += `  {\n`;
  codeInit += `    mesh: meshTxBuilder,\n`;
  codeInit += `    fetcher: provider,\n`;
  codeInit += `    wallet: wallet,\n`;
  codeInit += `    networkId: 0,\n`;
  codeInit += `  },\n`;
  codeInit += `  {\n`;
  codeInit += `    collectionName: 'collectionName',\n`;
  codeInit += `    paramUtxo: ${paramUtxo},\n`;
  codeInit += `  },\n`;
  codeInit += `);\n`;

  let codeOracle = ``;
  codeOracle += `const oracleData = await contract.getOracleData();\n`;

  return (
    <>
      <p>
        Getting the oracle data is essential to fetch the current NFT index.
      </p>
      <p>
        To facilitate this process, you must provide the <code>paramUtxo</code>{" "}
        that contains the output index and transaction hash of the NFT minting
        policy.
      </p>
      <Codeblock data={codeInit} />
      <p>
        The <code>getOracleData()</code> function will return the current oracle
        data.
      </p>
      <Codeblock data={codeOracle} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const paramUtxo = usePlutusNft((state) => state.paramUtxo);
  const collectionName = usePlutusNft((state) => state.collectionName);

  async function runDemo() {
    const contract = getContract(wallet, collectionName, JSON.parse(paramUtxo));
    const oracleData = await contract.getOracleData();
    return oracleData;
  }

  let code = ``;
  code += `const meshTxBuilder = new MeshTxBuilder({\n`;
  code += `  fetcher: provider,\n`;
  code += `  submitter: provider,\n`;
  code += `  verbose: true,\n`;
  code += `});\n`;
  code += `\n`;
  code += `const contract = new MeshPlutusNFTContract(\n`;
  code += `  {\n`;
  code += `    mesh: meshTxBuilder,\n`;
  code += `    fetcher: provider,\n`;
  code += `    wallet: wallet,\n`;
  code += `    networkId: 0,\n`;
  code += `  },\n`;
  code += `  {\n`;
  code += `    collectionName: '${collectionName}',\n`;
  code += `    paramUtxo: ${paramUtxo},\n`;
  code += `  },\n`;
  code += `);\n`;
  code += `\n`;
  code += `// Get Oracle Data\n`;
  code += `const oracleData = await contract.getOracleData();\n`;

  return (
    <LiveCodeDemo
      title="Get Oracle Data"
      subtitle="Fetch the current oracle data to get the current NFT index and other information"
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
