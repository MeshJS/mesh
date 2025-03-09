import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoParamUtxo, getContract, usePlutusNft } from "./common";

export default function PlutusNftSetupOracle() {
  return (
    <TwoColumnsScroll
      sidebarTo="setupOracle"
      title="Setup Oracle"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code = ``;
  code += `const contract = new MeshPlutusNFTContract(\n`;
  code += `  {\n`;
  code += `    mesh: meshTxBuilder,\n`;
  code += `    fetcher: provider,\n`;
  code += `    wallet: wallet,\n`;
  code += `    networkId: 0,\n`;
  code += `  },\n`;
  code += `  {\n`;
  code += `    collectionName: 'collectionName', // your nft collection name\n`;
  code += `  },\n`;
  code += `);\n`;
  code += `\n`;
  code += `const { tx, paramUtxo } = await contract.setupOracle(15000000); // price in lovelace\n`;

  let codeSign = `const signedTx = await wallet.signTx(tx);\n`;
  codeSign += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        First, we need to set up a one-time minting policy by minting an oracle
        token. This oracle token is essential as it holds the current state and
        index of the NFTs, acting as a reference for the minting sequence.
      </p>
      <p>
        We need to provide 2 parameters to setup the oracle, the price of the
        NFT in lovelace and the collection name. The collection name is used
        when initializing <code>MeshPlutusNFTContract</code> which is used to
        derive the script CBOR. The price of the NFT in lovelace is used in{" "}
        <code>setupOracle()</code> function which will be added into the oracle
        token.
      </p>
      <Codeblock data={code} />
      <p>
        The <code>setupOracle()</code> function will return a transaction CBOR
        and a<code>paramUtxo</code>. The <code>paramUtxo</code>
        will be used in the minting transaction of the NFT, so it is important
        to store it. Here is an example of the <code>paramUtxo</code>:
      </p>
      <Codeblock data={JSON.stringify(demoParamUtxo, null, 2)} />
      <p>
        The transaction CBOR can be signed and submitted using the following
        code:
      </p>
      <Codeblock data={codeSign} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const collectionName = usePlutusNft((state) => state.collectionName);
  const setCollectionName = usePlutusNft((state) => state.setCollectionName);
  const [userInput, setUserInput] = useState<string>("10000000");

  async function runDemo() {
    const lovelacePrice = parseInt(userInput);
    const contract = getContract(wallet, collectionName);
    const { tx, paramUtxo } = await contract.setupOracle(lovelacePrice);
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return { txHash, paramUtxo };
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
  code += `  },\n`;
  code += `);\n`;
  code += `\n`;
  code += `const { tx, paramUtxo } = await contract.setupOracle(${userInput});\n`;

  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Setup Oracle"
      subtitle="Mint one time minting policy to set up the oracle"
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
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="e.g. 15000000 = 15 ADA"
            label="NFT Price in Lovelace"
            key={0}
          />,
          <Input
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            placeholder="mesh"
            label="Collection Name"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
