import {
  deserializeAddress,
  MeshWallet,
  NativeScript,
  serializeNativeScript,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { getProvider } from "~/components/cardano/mesh-wallet";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder, txbuilderCode } from "../common";

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
  let codeKeyHash = ``;
  codeKeyHash += `const { pubKeyHash: keyHash1 } = deserializeAddress(walletAddress1);\n`;
  codeKeyHash += `const { pubKeyHash: keyHash2 } = deserializeAddress(walletAddress2);\n`;

  let codeNativeScript = ``;
  codeNativeScript += `const nativeScript: NativeScript = {\n`;
  codeNativeScript += `  type: "all",\n`;
  codeNativeScript += `  scripts: [\n`;
  codeNativeScript += `    {\n`;
  codeNativeScript += `      type: "sig",\n`;
  codeNativeScript += `      keyHash: keyHash1,\n`;
  codeNativeScript += `    },\n`;
  codeNativeScript += `    {\n`;
  codeNativeScript += `      type: "sig",\n`;
  codeNativeScript += `      keyHash: keyHash2,\n`;
  codeNativeScript += `    },\n`;
  codeNativeScript += `  ],\n`;
  codeNativeScript += `};\n`;

  let codeSerializeNativeScript = ``;
  codeSerializeNativeScript += `const { address: scriptAddress, scriptCbor } =\n`;
  codeSerializeNativeScript += `  serializeNativeScript(nativeScript);\n`;

  let codeTx = ``;
  codeTx += `// get utxo from script\n`;
  codeTx += `const utxos = await provider.fetchAddressUTxOs(scriptAddress);\n`;
  codeTx += `const utxo = utxos[0];\n`;
  codeTx += `\n`;
  codeTx += `// create tx\n`;
  codeTx += txbuilderCode;
  codeTx += `const unsignedTx = await txBuilder\n`;
  codeTx += `  .txIn(\n`;
  codeTx += `    utxo.input.txHash,\n`;
  codeTx += `    utxo.input.outputIndex,\n`;
  codeTx += `    utxo.output.amount,\n`;
  codeTx += `    utxo.output.address,\n`;
  codeTx += `  )\n`;
  codeTx += `  .txInScript(scriptCbor)\n`;
  codeTx += `  .txOut(\n`;
  codeTx += `    "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",\n`;
  codeTx += `    [{ unit: "lovelace", quantity: "2000000" }],\n`;
  codeTx += `  )\n`;
  codeTx += `  .changeAddress(scriptAddress)\n`;
  codeTx += `  .selectUtxosFrom(utxos)\n`;
  codeTx += `  .complete();\n`;

  let codeSign = ``;
  codeSign += `const signedTx1 = await wallet1.signTx(unsignedTx, true);\n`;
  codeSign += `const signedTx2 = await wallet2.signTx(signedTx1, true);\n`;
  codeSign += `\n`;
  codeSign += `const txHash = await wallet.submitTx(signedTx2);\n`;

  return (
    <>
      <p>
        Here is an example of creating a multi-signature (multisig) transaction
        with a native script, where you need to spend from a script address.
      </p>
      <h4>Create native script</h4>
      <p>
        First, we need to create a native script. In this example, we will
        create a native script with two signatures. That means we need to get
        the key hashes of the two wallets.
      </p>
      <Codeblock data={codeKeyHash} />
      <p>
        Next, we will create a native script object with the two key hashes. The
        native script object will be used to create a multi-signature
        transaction.
      </p>
      <Codeblock data={codeNativeScript} />
      <p>
        The native script object is then serialized into a CBOR object and an
        address.
      </p>
      <Codeblock data={codeSerializeNativeScript} />
      <h4>Create transaction</h4>
      <p>
        Now that we have the native script, we can create a transaction with the
        script. We first need to get the UTXO from the script address.
      </p>
      <Codeblock data={codeTx} />
      <p>
        Finally, we sign the transaction with the two wallets and submit the
        transaction.
      </p>
      <Codeblock data={codeSign} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function getMeshWallet() {
    const provider = getProvider();

    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: {
        type: "mnemonic",
        words: "solution,".repeat(24).split(",").slice(0, 24),
      },
    });

    const walletAddress = await wallet.getChangeAddress();

    const { pubKeyHash: keyHash } = deserializeAddress(walletAddress);
    return { wallet, keyHash, walletAddress };
  }

  async function getScript() {
    if (!connected) return;

    // first wallet
    const walletAddress = (await wallet.getUsedAddresses())[0];
    if (!walletAddress) return;
    const { pubKeyHash: keyHash1 } = deserializeAddress(walletAddress);

    // second wallet
    const { keyHash: keyHash2 } = await getMeshWallet();

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

    const { address: scriptAddress, scriptCbor } =
      serializeNativeScript(nativeScript);

    return { scriptAddress, scriptCbor: scriptCbor! };
  }

  async function runDemo() {
    if (!connected) return;

    const script = await getScript();
    if (!script) {
      throw new Error("Failed to get script");
    }
    const { scriptAddress, scriptCbor } = script;

    const provider = getProvider();
    const utxos = await provider.fetchAddressUTxOs(scriptAddress);

    if (utxos.length === 0) {
      throw new Error(`No utxos, fund address ${scriptAddress}`);
    }
    const utxo = utxos[0]!;

    const { wallet: walletB } = await getMeshWallet();

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

    const signedTx1 = await wallet.signTx(unsignedTx, true);
    const signedTx2 = await walletB.signTx(signedTx1, true);

    const txHash = await wallet.submitTx(signedTx2);
    return txHash;
  }

  let codeSnippet = ``;

  return (
    <LiveCodeDemo
      title="Multi-signature Transaction with native script"
      subtitle="Create a multi-signature transaction with a native script. In this demo, we will create a transaction with two signatures, where one signature is from the user wallet and the other is from the script."
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
