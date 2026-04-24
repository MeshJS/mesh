import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata } from "~/data/cardano";
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

  let codeAsset = ``;
  codeAsset += `const oracleData = await contract.getOracleData();\n`;
  codeAsset += `\n`;
  codeAsset += `const assetMetadata = {\n`;
  codeAsset += `  ...demoAssetMetadata,\n`;
  codeAsset += "  name: `Mesh Token ${oracleData.nftIndex}`,\n";
  codeAsset += `};\n`;

  let codeMint = ``;
  codeMint += `const tx = await contract.mintPlutusNFT(assetMetadata);\n`;
  codeMint += `const signedTx = await wallet.signTx(tx);\n`;
  codeMint += `const txHash = await wallet.submitTx(signedTx);\n`;
  return (
    <>
      <p>
        This NFT minting script enables users to mint NFTs with an automatically
        incremented index, which increases by one for each newly minted NFT.
      </p>
      <p>
        To facilitate this process, you must provide the <code>paramUtxo</code>{" "}
        that contains the output index and transaction hash of the NFT minting
        policy.
      </p>
      <Codeblock data={codeInit} />
      <p>
        The <code>mintPlutusNFT()</code> function mints an NFT with asset
        metadata, which is a JSON object containing the NFT metadata. You can
        use the <code>getOracleData()</code> function to fetch the oracle data,
        which includes the current NFT index. This index will be helpful if you
        need to define the NFT name and its metadata. Here is an example of the
        how we can define the asset metadata:
      </p>
      <Codeblock data={codeAsset} />
      <p>
        The <code>mintPlutusNFT()</code> function will return a transaction
        object that can be signed and submitted using the following code:
      </p>
      <Codeblock data={codeMint} />
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

    const assetMetadata = {
      ...demoAssetMetadata,
      name: `Mesh Token ${oracleData.nftIndex}`,
    };

    const tx = await contract.mintPlutusNFT(assetMetadata);
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
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
  code += `const oracleData = await contract.getOracleData(); // see getOracleData()\n`;
  code += `\n`;
  code += `// define your NFT metadata here\n`;
  code += `const assetMetadata = {\n`;
  code += `  ...demoAssetMetadata,\n`;
  code += "  name: `Mesh Token ${oracleData.nftIndex}`,\n";
  code += `};\n`;
  code += `\n`;
  code += `const tx = await contract.mintPlutusNFT(assetMetadata);\n`;

  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Mint Token"
      subtitle="Mint an NFT with asset metadata"
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
