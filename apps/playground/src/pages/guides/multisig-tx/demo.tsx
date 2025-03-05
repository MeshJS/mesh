import { useState } from "react";

import {
  experimentalSelectUtxos,
  MeshTxBuilder,
  MeshWallet,
  Quantity,
  Unit,
  UTxO,
} from "@meshsdk/core";
import { CardanoWallet, useWallet } from "@meshsdk/react";

import Button from "~/components/button/button";
import { getProvider } from "~/components/cardano/mesh-wallet";
import DemoResult from "~/components/sections/demo-result";
import { demoAddresses, demoAsset, demoMnemonic } from "~/data/cardano";

const walletSystemMnemonic = demoMnemonic;
const walletAccountAddress = demoAddresses.testnetPayment;
const mintingFee = "10000000";
const assetToSend = demoAsset;
const quantityAssetToSend = "1";

export default function Demo() {
  const { wallet, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(undefined);

  async function runDemo() {
    if (!connected) return;
    setLoading(true);

    const recipientAddress = await wallet.getChangeAddress();

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

    // backend to build tx
    const unsignedTx = await backendBuildTx(selectedUtxos, recipientAddress);
    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);

    setResponse(txHash);
    setLoading(false);
  }

  async function backendBuildTx(userUtxos: UTxO[], recipientAddress: string) {
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
    const systemWalletAddress = await systemWallet.getChangeAddress();

    // get utxos to send the asset
    const utxos = await systemWallet.getUtxos();
    const assetMap = new Map<Unit, Quantity>();
    assetMap.set(assetToSend, quantityAssetToSend);
    const systemUtxos = experimentalSelectUtxos(assetMap, utxos, "0");

    // determine outputs, need to reduce the assets for each wallet to return the balance back to each wallet
    console.log("userUtxos", userUtxos);
    console.log("systemUtxos", systemUtxos);
    const outputSystem = []; // todo
    const outputUser = []; // todo

    // build tx
    const txBuilder = new MeshTxBuilder({ fetcher: provider });
    const txHex = await txBuilder
      .selectUtxosFrom([...userUtxos, ...systemUtxos])

      .txOut(walletAccountAddress, [{ unit: "lovelace", quantity: mintingFee }])
      .txOut(recipientAddress, outputUser)
      .txOut(systemWalletAddress, outputSystem)
      .changeAddress(recipientAddress)
      .complete();

    const unsignedTx = await wallet.signTx(txHex, true);
    return unsignedTx;
  }

  return (
    <>
      <h2>Demo</h2>
      <p>Connect your wallet and click on the button to get tokens.</p>
      <CardanoWallet />
      <Button
        onClick={() => runDemo()}
        style={loading ? "warning" : "light"}
        disabled={loading || !connected}
      >
        Get Tokens
      </Button>
      <DemoResult response={response} />
    </>
  );
}
