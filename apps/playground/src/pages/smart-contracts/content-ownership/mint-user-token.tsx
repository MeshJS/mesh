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
  let code = ``;

  return <></>;
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
