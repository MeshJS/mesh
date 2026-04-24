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
      <p>
        This is the last transaction you need to setup the contract after
        completing all the `sendRefScriptOnchain` transactions.
      </p>
      <p>
        This transaction creates one content registry. Each registry should
        comes in pair with one content registry and each pair of registry serves
        around 50 records of content ownership. The application can be scaled
        indefinitely according to the number of parallelization needed and
        volumes of content expected to be managed.
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
    const tx = await contract.createOwnershipRegistry();
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.createOwnershipRegistry();\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Create Ownership Registry"
      subtitle="This transaction creates one content registry"
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
