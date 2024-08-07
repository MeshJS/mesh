import { useState } from "react";

import {
  mConStr0,
  PlutusScript,
  resolvePlutusScriptAddress,
  serializePlutusScript,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { fetchAssetUtxo } from "~/components/cardano/fetch-utxo-by-datum";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset, demoPlutusAlwaysSucceedScript } from "~/data/cardano";
import { getTxBuilder } from "../common";

export default function TxbuilderContractUnlockAssets() {
  return (
    <TwoColumnsScroll
      sidebarTo="TxbuilderContractUnlockAssets"
      title="Unlock Assets"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = ``;

  return (
    <>
      <p></p>
      <Codeblock data={code1} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [userInput, setUserInput] = useState<string>(demoAsset);
  const [userInput2, setUserInput2] = useState<string>("meshsecretcode");

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const collateral = await wallet.getCollateral();

    const changeAddress = await wallet.getChangeAddress();

    const script: PlutusScript = {
      code: demoPlutusAlwaysSucceedScript,
      version: "V2",
    };
    const { address: scriptAddress } = serializePlutusScript(script);

    console.log("scriptAddress", scriptAddress);

    const assetUtxo = await fetchAssetUtxo({
      address: scriptAddress,
      asset: userInput,
      datum: userInput2,
    });
    if (assetUtxo === undefined) {
      throw "Asset UTXO not found";
    }

    const txBuilder = getTxBuilder();

    // todo
    const unsignedTx = await txBuilder
      .spendingPlutusScriptV2()
      .txIn(assetUtxo.input.txHash, assetUtxo.input.outputIndex)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr0([]))
      .txInScript(demoPlutusAlwaysSucceedScript)
      .changeAddress(changeAddress)
      .txInCollateral(
        collateral[0]?.input.txHash!,
        collateral[0]?.input.outputIndex!,
        collateral[0]?.output.amount!,
        collateral[0]?.output.address!,
      )
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = `import { keepRelevant, MeshTxBuilder, Quantity, Unit } from "@meshsdk/core";\n\n`;

  return (
    <LiveCodeDemo
      title="Unlock Assets"
      subtitle="Unlock assets in a Plutus script"
      code={codeSnippet}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Asset unit"
            label="Asset unit"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Datum"
            label="Datum"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
