import { useState } from "react";

import {
  mConStr0,
  PlutusScript,
  resolveScriptHash,
  stringToHex,
  UTxO,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import {
  demoAddresses,
  demoAssetMetadata,
  demoPlutusMintingScript,
} from "~/data/cardano";
import { getTxBuilder } from "../common";

export default function TxbuilderMintingPlutusScript() {
  const [userInput, setUserInput] = useState<string>("mesh");

  return (
    <TwoColumnsScroll
      sidebarTo="mintingPlutusScript"
      title="Minting Assets with Plutus Script"
      leftSection={Left(userInput)}
      rightSection={Right(userInput, setUserInput)}
    />
  );
}

function Left(userInput: string) {
  let codeSnippet1 = ``;
  codeSnippet1 += `const policyId = resolveScriptHash(${demoPlutusMintingScript}, "V2");\n`;

  let codeSnippet2 = `const assetMetadata: AssetMetadata = ${JSON.stringify(
    demoAssetMetadata,
    null,
    2,
  )};\n\n`;
  codeSnippet2 += `const tokenName = "MeshToken";\n`;
  codeSnippet2 += `const tokenNameHex = stringToHex(tokenName);\n`;
  codeSnippet2 += `const metadata = { [policyId]: { [tokenName]: { ...demoAssetMetadata } } };\n`;

  let codeSnippet3 = `const txBuilder = getTxBuilder();\n\n`;

  codeSnippet3 += `const unsignedTx = await txBuilder\n`;
  codeSnippet3 += `  .mintPlutusScriptV2()\n`;
  codeSnippet3 += `  .mint("1", policyId, tokenNameHex)\n`;
  codeSnippet3 += `  .mintingScript(demoPlutusMintingScript)\n`;
  codeSnippet3 += `  .mintRedeemerValue(mConStr0([userInput]))\n`;
  codeSnippet3 += `  .metadataValue("721", metadata)\n`;
  codeSnippet3 += `  .changeAddress(changeAddress)\n`;
  codeSnippet3 += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet3 += `  .txInCollateral(\n`;
  codeSnippet3 += `    collateral.input.txHash,\n`;
  codeSnippet3 += `    collateral.input.outputIndex,\n`;
  codeSnippet3 += `    collateral.output.amount,\n`;
  codeSnippet3 += `    collateral.output.address,\n`;
  codeSnippet3 += `  )\n`;
  codeSnippet3 += `  .complete();\n`;

  return (
    <>
      <p>
        In this section, we will see how to mint native assets with a{" "}
        <code>PlutusScript</code>.
      </p>
      <p>
        The <code>PlutusScript</code> object is used to define the Plutus script
        that will be used to mint the asset. The <code>redeemer</code> object is
        used to provide the data that the validator script will use to validate
        the transaction.
      </p>
      <Codeblock data={codeSnippet1} />
      <p>
        Similar to previous examples, we define the asset metadata. The asset
        metadata is a JSON object that contains the metadata for the asset.
      </p>
      <Codeblock data={codeSnippet2} />
      <p>
        Finally, we create a transaction and mint the asset with the lower level
        APIs. We set the required signers to include the address that is minting
        the asset.
      </p>
      <Codeblock data={codeSnippet3} />
    </>
  );
}

function Right(userInput: string, setUserInput: (value: string) => void) {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const collateral: UTxO = (await wallet.getCollateral())[0]!;
    const changeAddress = await wallet.getChangeAddress();

    const policyId = resolveScriptHash(demoPlutusMintingScript, "V2");
    const tokenName = "MeshToken";
    const tokenNameHex = stringToHex(tokenName);
    const metadata = { [policyId]: { [tokenName]: { ...demoAssetMetadata } } };

    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .mintPlutusScriptV2()
      .mint("1", policyId, tokenNameHex)
      .mintingScript(demoPlutusMintingScript)
      .mintRedeemerValue(mConStr0([userInput]))
      .metadataValue("721", metadata)
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .complete();

    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  // todo docs, determine the `cst` import
  let code = ``;
  code += `const utxos = await wallet.getUtxos();\n`;
  code += `const collateral: UTxO = (await wallet.getCollateral())[0]!;\n`;
  code += `const changeAddress = await wallet.getChangeAddress();\n`;
  code += `\n`;
  code += `const policyId = resolveScriptHash(demoPlutusMintingScript, "V2");\n`;
  code += `const tokenName = "MeshToken";\n`;
  code += `const tokenNameHex = stringToHex(tokenName);\n`;
  code += `const metadata = { [policyId]: { [tokenName]: { ...demoAssetMetadata } } };\n`;
  code += `\n`;
  code += `const txBuilder = getTxBuilder();\n`;
  code += `\n`;
  code += `const unsignedTx = await txBuilder\n`;
  code += `  .mintPlutusScriptV2()\n`;
  code += `  .mint("1", policyId, tokenNameHex)\n`;
  code += `  .mintingScript(demoPlutusMintingScript)\n`;
  code += `  .mintRedeemerValue(mConStr0([userInput]))\n`;
  code += `  .metadataValue("721", metadata)\n`;
  code += `  .changeAddress(changeAddress)\n`;
  code += `  .selectUtxosFrom(utxos)\n`;
  code += `  .txInCollateral(\n`;
  code += `    collateral.input.txHash,\n`;
  code += `    collateral.input.outputIndex,\n`;
  code += `    collateral.output.amount,\n`;
  code += `    collateral.output.address,\n`;
  code += `  )\n`;
  code += `  .complete();\n`;
  code += `\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Mint Assets with Plutus Script"
      subtitle="Mint native assets with Plutus Script. For this example, the Plutus script expects a data field of 'mesh'."
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
      code={code}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Redeemer value"
            label="Redeemer value"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
