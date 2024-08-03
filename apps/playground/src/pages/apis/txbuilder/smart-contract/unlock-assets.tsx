import { useState } from "react";
import Link from "next/link";

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
  let codeScript = `import { serializePlutusScript } from '@meshsdk/core';\n`;
  codeScript += `import type { PlutusScript } from '@meshsdk/core';\n\n`;
  codeScript += `const script: PlutusScript = {\n`;
  codeScript += `  code: '${demoPlutusAlwaysSucceedScript}',\n`;
  codeScript += `  version: 'V2',\n`;
  codeScript += `};\n\n`;
  codeScript += `const { address: scriptAddress } = serializePlutusScript(script);\n`;

  let codeSnippetGetAssetUtxo = ``;
  codeSnippetGetAssetUtxo += `async function _getAssetUtxo({ scriptAddress, asset, datum }) {\n`;
  codeSnippetGetAssetUtxo += `  const koios = new KoiosProvider('preprod');\n\n`;
  codeSnippetGetAssetUtxo += `  const utxos = await koios.fetchAddressUTxOs(\n`;
  codeSnippetGetAssetUtxo += `    scriptAddress,\n`;
  codeSnippetGetAssetUtxo += `    asset\n`;
  codeSnippetGetAssetUtxo += `  );\n\n`;
  codeSnippetGetAssetUtxo += `  const dataHash = resolveDataHash(datum);\n\n`;
  codeSnippetGetAssetUtxo += `  let utxo = utxos.find((utxo: any) => {\n`;
  codeSnippetGetAssetUtxo += `    return utxo.output.dataHash == dataHash;\n`;
  codeSnippetGetAssetUtxo += `  });\n\n`;
  codeSnippetGetAssetUtxo += `  return utxo;\n`;
  codeSnippetGetAssetUtxo += `}\n`;

  let codeSnippetCallAssetUtxo = "";
  codeSnippetCallAssetUtxo += `// fetch input UTXO\n`;
  codeSnippetCallAssetUtxo += `const assetUtxo = await _getAssetUtxo({\n`;
  codeSnippetCallAssetUtxo += `  scriptAddress: scriptAddress,\n`;
  codeSnippetCallAssetUtxo += `  asset: '<UNIT_HERE>',\n`;
  codeSnippetCallAssetUtxo += `  datum: '<DATUM_HERE>',\n`;
  codeSnippetCallAssetUtxo += `});`;

  let codeSnippetCreateTx = ``;
  codeSnippetCreateTx += `const txBuilder = getTxBuilder();\n`;
  codeSnippetCreateTx += `\n`;
  codeSnippetCreateTx += `const unsignedTx = await txBuilder\n`;
  codeSnippetCreateTx += `  .spendingPlutusScriptV2()\n`;
  codeSnippetCreateTx += `  .txIn(assetUtxo.input.txHash, assetUtxo.input.outputIndex)\n`;
  codeSnippetCreateTx += `  .txInInlineDatumPresent()\n`;
  codeSnippetCreateTx += `  .txInRedeemerValue(mConStr0([]))\n`;
  codeSnippetCreateTx += `  .txInScript(demoPlutusAlwaysSucceedScript)\n`;
  codeSnippetCreateTx += `  .changeAddress(changeAddress)\n`;
  codeSnippetCreateTx += `  .txInCollateral(\n`;
  codeSnippetCreateTx += `    collateral[0]?.input.txHash!,\n`;
  codeSnippetCreateTx += `    collateral[0]?.input.outputIndex!,\n`;
  codeSnippetCreateTx += `    collateral[0]?.output.amount!,\n`;
  codeSnippetCreateTx += `    collateral[0]?.output.address!,\n`;
  codeSnippetCreateTx += `  )\n`;
  codeSnippetCreateTx += `  .selectUtxosFrom(utxos)\n`;
  codeSnippetCreateTx += `  .complete();\n`;

  let codeSnippetSign = ``;
  codeSnippetSign += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippetSign += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        In this section, we will demonstrate how to unlock assets in a smart
        contract.
      </p>
      <p>
        First, we need to define the smart contract script and resolve the
        script address.
      </p>
      <Codeblock data={codeScript} />
      <p>
        Next, let's create a function to fetch the correct input UTxO from the
        script address. This input UTxO is needed for the transaction builder.
        Notee that in this demo, we are using <code>KoiosProvider</code>, but
        any of the providers which are implemented by Mesh can be used (see{" "}
        <Link href="/apis/providers">Providers</Link>).
      </p>
      <Codeblock data={codeSnippetGetAssetUtxo} />
      <p>
        For this demo, we search for the UTxO by using the datum that we have
        set in the previous step. In fact, depends on the redeemer logic of the
        script, only a transaction with the corrent datum supplied is able to
        unlock the assets. We query the script address for the UTxO that
        contains the correct data hash:
      </p>
      <Codeblock data={codeSnippetCallAssetUtxo} />
      <p>
        Then, we create the transaction to unlock the asset. We use the{" "}
        <code>redeemValue</code> method. The method takes the asset UTxO, the
        script, and the datum as parameters. We also use the{" "}
        <code>sendValue</code> method to send the asset to the recipient
        address. The <code>setRequiredSigners</code> method is used to set the
        required signers for the transaction.
      </p>
      <Codeblock data={codeSnippetCreateTx} />
      <p>
        Lastly, we build and sign the transaction. Note that here we need to set
        the 'partial sign' parameter to <code>true</code>.
      </p>
      <Codeblock data={codeSnippetSign} />
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

    const assetUtxo = await fetchAssetUtxo({
      address: scriptAddress,
      asset: userInput,
      datum: userInput2,
    });
    if (assetUtxo === undefined) {
      throw "Asset UTXO not found";
    }

    const txBuilder = getTxBuilder();

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

  let codeSnippet = ``;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const collateral = await wallet.getCollateral();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const script: PlutusScript = {\n`;
  codeSnippet += `  code: demoPlutusAlwaysSucceedScript,\n`;
  codeSnippet += `  version: "V2",\n`;
  codeSnippet += `};\n`;
  codeSnippet += `const { address: scriptAddress } = serializePlutusScript(script);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const assetUtxo = await fetchAssetUtxo({\n`;
  codeSnippet += `  address: scriptAddress,\n`;
  codeSnippet += `  asset: userInput,\n`;
  codeSnippet += `  datum: userInput2,\n`;
  codeSnippet += `});\n`;
  codeSnippet += `if (assetUtxo === undefined) {\n`;
  codeSnippet += `  throw "Asset UTXO not found";\n`;
  codeSnippet += `}\n`;
  codeSnippet += `\n`;
  codeSnippet += `const txBuilder = getTxBuilder();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await txBuilder\n`;
  codeSnippet += `  .spendingPlutusScriptV2()\n`;
  codeSnippet += `  .txIn(assetUtxo.input.txHash, assetUtxo.input.outputIndex)\n`;
  codeSnippet += `  .txInInlineDatumPresent()\n`;
  codeSnippet += `  .txInRedeemerValue(mConStr0([]))\n`;
  codeSnippet += `  .txInScript(demoPlutusAlwaysSucceedScript)\n`;
  codeSnippet += `  .changeAddress(changeAddress)\n`;
  codeSnippet += `  .txInCollateral(\n`;
  codeSnippet += `    collateral[0]?.input.txHash!,\n`;
  codeSnippet += `    collateral[0]?.input.outputIndex!,\n`;
  codeSnippet += `    collateral[0]?.output.amount!,\n`;
  codeSnippet += `    collateral[0]?.output.address!,\n`;
  codeSnippet += `  )\n`;
  codeSnippet += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet += `  .complete();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

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
