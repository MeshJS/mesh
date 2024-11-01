import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAsset } from "~/data/cardano";
import {
  getContract,
  InputsOperationAddress,
  InputsParamUtxo,
  InputsRefScriptUtxos,
  useContentOwnership,
} from "./common";

export default function OwnershipCreateContent() {
  return (
    <TwoColumnsScroll
      sidebarTo="createContent"
      title="Create Content"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        This transaction creates a content attached to the registry reference by
        a token. You can use any token for <code>ownerAssetHex</code> and the{" "}
        <code>contentHashHex</code> is a string to identify the content.
      </p>
      <p>
        <b>Note:</b> You must provide the <code>paramUtxo</code> from the{" "}
        <code>mintOneTimeMintingPolicy</code> transaction.
      </p>
      <p>
        <b>Note:</b> You must provide the txHash for
        <code>ContentRegistry</code>, <code>ContentRefToken</code>,{" "}
        <code>OwnershipRegistry</code>,<code>OwnershipRefToken</code>{" "}
        transactions.
      </p>
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

    const asset = demoAsset;
    const contentHashHex = "ipfs://contentHashHex";
    const registryNumber = 0;

    const tx = await contract.createContent(
      asset,
      contentHashHex,
      registryNumber,
    );
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const asset = demoAsset;\n`;
  code += `const contentHashHex = "ipfs://contentHashHex";\n`;
  code += `const registryNumber = 0;\n`;
  code += `\n`;
  code += `const tx = await contract.createContent(\n`;
  code += `  asset,\n`;
  code += `  contentHashHex,\n`;
  code += `  registryNumber,\n`;
  code += `);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Create Content"
      subtitle="For users to create a content attached to the registry reference by a token"
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
