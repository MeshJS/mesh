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
let originalMetadata = "";

const provider = getProvider();

const systemWallet = new MeshWallet({
  networkId: 0,
  fetcher: provider,
  submitter: provider,
  key: {
    type: "mnemonic",
    words: walletSystemMnemonic,
  },
});

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

    // user sign
    const signedTx = await wallet.signTx(unsignedTx, true);

    // backend sign and submit
    const backendSignedTx = await backendSignTx(signedTx);

    const txHash = await wallet.submitTx(backendSignedTx);

    setResponse(txHash);
    setLoading(false);
  }

  async function backendBuildTx(userUtxos: UTxO[], recipientAddress: string) {
    const systemWalletAddress = await systemWallet.getChangeAddress();
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

    originalMetadata = Transaction.readMetadata(unsignedTx);

    const maskedTx = Transaction.maskMetadata(unsignedTx);
    return maskedTx;
  }

  async function backendSignTx(unsignedTx: string) {
    const signedOriginalTx = Transaction.writeMetadata(
      unsignedTx,
      originalMetadata,
    );
    const meshWalletSignedTx = await systemWallet.signTx(
      signedOriginalTx,
      true,
    );
    return meshWalletSignedTx;
  }

  return (
    <>
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
