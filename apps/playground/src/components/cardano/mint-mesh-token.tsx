import { ForgeScript, MeshWallet, Mint, Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { demoAssetMetadata, demoMnemonic } from "~/data/cardano";
import LiveCodeDemo from "../sections/live-code-demo";
import { getProvider } from "./mesh-wallet";

export default function MintMeshToken() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const blockchainProvider = getProvider();
    const mintingWallet = new MeshWallet({
      networkId: 0,
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      key: {
        type: "mnemonic",
        words: demoMnemonic,
      },
    });
    const forgingScript = ForgeScript.withOneSignature(
      mintingWallet.getChangeAddress(),
    );

    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];

    const asset: Mint = {
      assetName: "MeshToken",
      assetQuantity: "1",
      metadata: demoAssetMetadata,
      label: "721",
      recipient: address,
    };

    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.mintAsset(forgingScript, asset);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx, true);
    const signedTx2 = await mintingWallet.signTx(signedTx, true);
    const txHash = await wallet.submitTx(signedTx2);
    return txHash;
  }

  return (
    <LiveCodeDemo
      title="Mint Mesh Token"
      subtitle="Mint a Mesh Token to try demos"
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
      hideDemoButtonIfnotConnected={true}
      hideConnectButtonIfConnected={true}
    ></LiveCodeDemo>
  );
}
