import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata } from "~/data/cardano";
import {
  getContract,
  InputsOperationAddress,
  InputsParamUtxo,
  useContentOwnership,
} from "./common";

export default function OwnershipMintUserToken() {
  return (
    <TwoColumnsScroll
      sidebarTo="mintUserToken"
      title="Mint User Token"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        This transaction mints a token that users can use to create content.
      </p>
      <p>
        Note that you can actually use any tokens for{" "}
        <code>createContent()</code>, this <code>mintUserToken()</code> function
        is just helpful if you want to mint a token specifically for this
        purpose.
      </p>
      <p>
        Note that you signTx with <code>true</code> to mint the token to enable
        partial signing.
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

  async function runDemo() {
    const contract = getContract(
      wallet,
      operationAddress,
      JSON.parse(paramUtxo) as { outputIndex: number; txHash: string },
    );
    const tx = await contract.mintUserToken("MeshContentOwnership", {
      ...demoAssetMetadata,
      name: "Mesh Content Ownership",
      description:
        "Demo at https://meshjs.dev/smart-contracts/content-ownership",
    });
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.mintUserToken("MeshContentOwnership", {\n`;
  code += `  name: "Mesh Content Ownership",\n`;
  code += `  description: "Demo at https://meshjs.dev/smart-contracts/content-ownership",\n`;
  code += `});\n`;
  code += `const signedTx = await wallet.signTx(tx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Mint User Token"
      subtitle="Mint a token that users can use to create content"
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
