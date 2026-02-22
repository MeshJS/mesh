import { useState } from "react";

import { mConStr0, PlutusScript, serializePlutusScript } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { fetchAssetUtxo } from "~/components/cardano/fetch-utxo-by-datum";
import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset, demoPlutusAlwaysSucceedScript } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

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
  let codeIndicator = ``;
  codeIndicator += `.spendingPlutusScriptV1()\n`;
  codeIndicator += `.spendingPlutusScriptV2()\n`;
  codeIndicator += `.spendingPlutusScriptV3()\n`;

  let code = `${txbuilderCode}txBuilder
  .spendingPlutusScriptV2()
  .txIn(txHash: string, txIndex: number, amount?: Asset[], address?: string)
  .txInInlineDatumPresent() // or .txInDatumValue(datum: Data | string | object)
  .txInRedeemerValue(redeemer: Data | object | string, type?: string, exUnits?: Budget)
  .spendingTxInReference(txHash: string, txIndex: number, spendingScriptHash?: string) // or supplying script
`;

  return (
    <>
      <>
        <p>
          Unlocking with <code>MeshTxBuilder</code> starts with anyone of the
          below script version indicators:
        </p>
        <Codeblock data={codeIndicator} />
        <p>Followed by specifying the exact script input to spend with:</p>
        <Codeblock
          data={`.txIn(txHash: string, txIndex: number, amount?: Asset[], address?: string)`}
        />
        <p>
          In Cardano, if you want to unlock assets from a script address, you
          have to provide 3 other necessary information apart from{" "}
          <code>.txIn()</code> itself. They are:
        </p>
        <ul>
          <li>Actual script</li>
          <li>Datum of the input</li>
          <li>Redeemer of the unlock</li>
        </ul>
        <h4>Actual script</h4>
        <p>
          The actual script can be either provided by transaction builder or
          referenced from an UTxO onchain.
        </p>
        <div>
          <ul>
            <li>
              (i) Reference script{` `}
              <Codeblock data={`.spendingTxInReference()`} />
            </li>
            <li>
              (ii) Supplying script{` `}
              <Codeblock data={`.txInScript(scriptCbor: string)`} />
            </li>
          </ul>
          <br />
        </div>
        <h4>Datum of the input</h4>
        <p>
          Similar to script, datum can also either be provided by transaction
          builder or as inline datum.
        </p>
        <div>
          <ul>
            <li>
              (i) Referencing inline datum{" "}
              <Codeblock data={`.txInInlineDatumPresent()`} />
            </li>
            <li>
              (ii) Supplying datum{" "}
              <Codeblock
                data={`.txInDatumValue(datum: Data | object | string, type?: "Mesh" | "CBOR" | "JSON")`}
              />
            </li>
          </ul>
          <br />
        </div>
        <h4>Redeemer of the unlock</h4>
        <p>
          Redeemer can be provided in different{" "}
          <Link href="/apis/data">data types</Link>. If your MeshTxBuilder does
          not include an <code>evaluator</code> instance, you can also provide
          your budget for the unlock with this redeemer endpoint
        </p>
        <Codeblock
          data={`.txInRedeemerValue(redeemer: Data | object | string, type: "Mesh" | "CBOR" | "JSON", exUnits?: Budget)`}
        />
      </>
      <p>
        An example of complete set of endpoints to unlock assets from a script
        address:
      </p>
      <Codeblock data={code} />
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
  codeSnippet += txbuilderCode;
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
