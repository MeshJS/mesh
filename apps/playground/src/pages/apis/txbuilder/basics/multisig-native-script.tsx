import {
  AppWallet,
  deserializeAddress,
  ForgeScript,
  MeshTxBuilder,
  MeshWallet,
  NativeScript,
  resolveScriptHash,
  serializeNativeScript,
  stringToHex,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { getProvider } from "~/components/cardano/mesh-wallet";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata, demoMnemonic } from "~/data/cardano";
import { getTxBuilder } from "../common";

// const scriptAddress =
//   "addr_test1vpd5480qj5jj4pnjwq9yxnac8l9dw2k3y6gz2cpp6jawzwq838jl8";
// const scriptCbor =
//   "8201828200581c556f3a70b8a68081cf36c918dd9933abdca34f20fc534499c817182b8200581c5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f";

export default function TxbuilderMultisigNativeScript() {
  return (
    <TwoColumnsScroll
      sidebarTo="multisigNativeScript"
      title="Multi-signature Transaction with Native Script"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeTx = ``;

  return (
    <>
      <p></p>
      <Codeblock data={codeTx} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  function getMeshWallet() {
    const blockchainProvider = getProvider();

    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      key: {
        type: "mnemonic",
        words: "solution,".repeat(24).split(",").slice(0, 24),
      },
    });

    const walletAddress = wallet.getChangeAddress();

    const { pubKeyHash: keyHash } = deserializeAddress(walletAddress);
    return { wallet, keyHash, walletAddress };
  }

  async function getScript() {
    if (!connected) return;

    // first wallet
    const walletAddress = (await wallet.getUsedAddresses())[0];
    if (!walletAddress) return;
    const { pubKeyHash: keyHash1 } = deserializeAddress(walletAddress);
    // const nativeScriptA: NativeScript = {
    //   type: "all",
    //   scripts: [
    //     {
    //       type: "sig",
    //       keyHash: keyHash,
    //     },
    //   ],
    // };

    // console.log("Native script A");
    // const { address: scriptAddressA, scriptCbor: scriptCborA } =
    //   serializeNativeScript(nativeScriptA);
    // console.log("Script address:", scriptAddressA);
    // console.log("Script CBOR:", scriptCborA);
    console.log("keyHash1", keyHash1);

    // second wallet
    const { keyHash: keyHash2 } = getMeshWallet();
    // const nativeScriptB: NativeScript = {
    //   type: "all",
    //   scripts: [
    //     {
    //       type: "sig",
    //       keyHash: keyHash2,
    //     },
    //   ],
    // };

    // console.log("Native script B");
    // const { address: scriptAddressB, scriptCbor: scriptCborB } =
    //   serializeNativeScript(nativeScriptB);
    // console.log("Script address:", scriptAddressB);
    // console.log("Script CBOR:", scriptCborB);
    console.log("keyHash2", keyHash2);

    // combine

    // const nativeScript: NativeScript = {
    //   type: "atLeast",
    //   required: 2,
    //   scripts: [nativeScriptA, nativeScriptB],
    // };
    const nativeScript: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "sig",
          keyHash: keyHash1,
        },
        {
          type: "sig",
          keyHash: keyHash2,
        },
      ],
    };

    console.log("Native script combine");
    const { address: scriptAddress, scriptCbor } =
      serializeNativeScript(nativeScript);
    console.log("Script address:", scriptAddress);
    console.log("Script CBOR:", scriptCbor);

    return { scriptAddress, scriptCbor: scriptCbor! };
  }

  async function runDemo() {
    if (!connected) return;

    const script = await getScript();
    if (!script) return;
    const { scriptAddress, scriptCbor } = script;

    const blockchainProvider = getProvider();
    const utxos = await blockchainProvider.fetchAddressUTxOs(scriptAddress);

    if (utxos.length === 0) {
      console.log("No utxos");
      return;
    }
    const utxo = utxos[0]!;
    console.log("utxo", utxo);

    // const walletAddress = (await wallet.getUsedAddresses())[0];
    // if (!walletAddress) return;
    // const { pubKeyHash: keyHash1 } = deserializeAddress(walletAddress);
    const { wallet: walletB, keyHash: keyHash2 } = getMeshWallet();

    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .txIn(
        utxo.input.txHash,
        utxo.input.outputIndex,
        utxo.output.amount,
        utxo.output.address,
      )
      .txInScript(scriptCbor)
      .txOut(
        "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(scriptAddress)
      .selectUtxosFrom(utxos)
      .complete();

    console.log("unsignedTx", unsignedTx);

    const signedTx1 = await wallet.signTx(unsignedTx, true);
    const signedTx2 = await walletB.signTx(signedTx1, true);

    const txHash = await wallet.submitTx(signedTx2);
    console.log("txHash", txHash);
    return txHash;
  }

  let codeSnippet = ``;

  return (
    <LiveCodeDemo
      title="Multi-signature Transaction"
      subtitle="Create a multi-signature transaction. In this demo, we will create a transaction with two signatures, where one signature is from the user wallet and the other is from a minting wallet."
      code={codeSnippet}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    ></LiveCodeDemo>
  );
}
