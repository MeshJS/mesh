import { useState } from "react";

import {
  experimentalSelectUtxos,
  ForgeScript,
  MeshWallet,
  Mint,
  Quantity,
  Transaction,
  Unit,
  UTxO,
} from "@meshsdk/core";
import { CardanoWallet, useWallet } from "@meshsdk/react";

import Button from "~/components/button/button";
import { getProvider } from "~/components/cardano/mesh-wallet";
import DemoResult from "~/components/sections/demo-result";
import { demoAddresses, demoAssetMetadata, demoMnemonic } from "~/data/cardano";

const walletSystemMnemonic = demoMnemonic;
const walletAccountAddress = demoAddresses.testnetPayment;
const mintingFee = "10000000";

export default function Demo() {
  const { wallet, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(undefined);

  async function runDemo() {
    if (!connected) return;
    setLoading(true);

    // get utxos to pay for minting fee
    const utxos = await wallet.getUtxos();
    const assetMap = new Map<Unit, Quantity>();
    assetMap.set("lovelace", mintingFee);
    const selectedUtxos = experimentalSelectUtxos(assetMap, utxos, "5000000");

    if (selectedUtxos.length === 0) {
      setResponse("Not enough funds to mint");
      setLoading(false);
      return;
    }

    const recipientAddress = await wallet.getChangeAddress();

    // backend to build tx
    const unsignedTx = await backendBuildTx(selectedUtxos, recipientAddress);
    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);

    setResponse(txHash);
    setLoading(false);
  }

  async function backendBuildTx(userUtxos: UTxO[], recipientAddress: string) {
    const blockchainProvider = getProvider();

    const systemWallet = new MeshWallet({
      networkId: 0,
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      key: {
        type: "mnemonic",
        words: walletSystemMnemonic,
      },
    });

    const systemWalletAddress = systemWallet.getChangeAddress();
    const forgingScript = ForgeScript.withOneSignature(systemWalletAddress);
    const assetName = "MeshToken";

    const asset: Mint = {
      assetName: assetName,
      assetQuantity: "1",
      metadata: demoAssetMetadata,
      label: "721",
      recipient: recipientAddress,
    };

    const tx = new Transaction({ initiator: systemWallet });
    tx.setTxInputs(userUtxos);
    tx.mintAsset(forgingScript, asset);
    tx.sendLovelace(walletAccountAddress, mintingFee);
    tx.setChangeAddress(recipientAddress);
    const unsignedTx = await tx.build();

    const meshWalletSignedTx = await systemWallet.signTx(unsignedTx, true);

    return meshWalletSignedTx;
  }

  return (
    <>
      <h2>Demo</h2>
      <p>Connect your wallet and click on the button to mint a token.</p>
      <CardanoWallet />
      <Button
        onClick={() => runDemo()}
        style={loading ? "warning" : "light"}
        disabled={loading || !connected}
      >
        Multi-sig Minting
      </Button>
      <DemoResult response={response} />
    </>
  );
}
