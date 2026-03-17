import { useState } from "react";

import { mConStr0, resolveScriptHash, stringToHex, UTxO } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata, demoPlutusMintingScript } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderMintingPlutusScript() {
  return (
    <TwoColumnsScroll
      sidebarTo="mintingPlutusScript"
      title="Minting Assets with Plutus Script"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeIndicator = ``;
  codeIndicator += `.mintPlutusScriptV1()\n`;
  codeIndicator += `.mintPlutusScriptV2()\n`;
  codeIndicator += `.mintPlutusScriptV3()\n`;

  let codeSnippet3 = txbuilderCode;
  codeSnippet3 += `const unsignedTx = await txBuilder\n`;
  codeSnippet3 += `  .mintPlutusScriptV2()\n`;
  codeSnippet3 += `  .mint("1", policyId, tokenNameHex)\n`;
  codeSnippet3 += `  .mintingScript(demoPlutusMintingScript)\n`;
  codeSnippet3 += `  .mintRedeemerValue(mConStr0([userInput]))\n`;
  codeSnippet3 += `  .metadataValue(721, metadata)\n`;
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
        Minting Plutus tokens with <code>MeshTxBuilder</code> starts with anyone
        of the below script version indicators:
      </p>
      <Codeblock data={codeIndicator} />
      <p>Followed by specifying the minting information:</p>
      <Codeblock
        data={`.mint(quantity: string, policy: string, name: string)`}
      />
      <p>
        Similar to unlocking assets, minting or burning Plutus tokens require
        providing redeemer and scripts. However, no datum information is needed
        in minting or burning.
      </p>
      <h4>Script of the token</h4>
      <p>
        The actual script can be either provided by transaction builder or
        referenced from an UTxO onchain.
      </p>
      <div>
        <ul>
          <li>
            (i) Reference script{` `}
            <Codeblock
              data={`.mintTxInReference(txHash: string, txIndex: number)`}
            />
          </li>
          <li>
            (ii) Supplying script{` `}
            <Codeblock data={`.mintingScript(scriptCbor: string)`} />
          </li>
        </ul>
        <br />
      </div>
      <h4>Redeemer of the mint</h4>
      <p>
        Redeemer can be provided in different{" "}
        <Link href="/apis/data">data types</Link>. If your MeshTxBuilder does
        not include an <code>evaluator</code> instance, you can also provide
        your budget for the unlock with this redeemer endpoint
      </p>
      <Codeblock
        data={`.mintRedeemerValue(redeemer: Data | object | string, type: "Mesh" | "CBOR" | "JSON", exUnits?: Budget)`}
      />
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>("mesh");

  const { wallet, connected } = useWallet();

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const collateral: UTxO = (await wallet.getCollateral())[0]!;
    const changeAddress = await wallet.getChangeAddress();

    const policyId = resolveScriptHash(demoPlutusMintingScript, "V2");
    const tokenName = userInput;
    const tokenNameHex = stringToHex(tokenName);
    const metadata = { [policyId]: { [tokenName]: { ...demoAssetMetadata } } };

    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .mintPlutusScriptV2()
      .mint("1", policyId, tokenNameHex)
      .mintingScript(demoPlutusMintingScript)
      .mintRedeemerValue(mConStr0([userInput]))
      .metadataValue(721, metadata)
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

  let code = ``;
  code += `const utxos = await wallet.getUtxos();\n`;
  code += `const collateral: UTxO = (await wallet.getCollateral())[0]!;\n`;
  code += `const changeAddress = await wallet.getChangeAddress();\n`;
  code += `\n`;
  code += `const policyId = resolveScriptHash(demoPlutusMintingScript, "V2");\n`;
  code += `const tokenName = '${userInput}';\n`;
  code += `const tokenNameHex = stringToHex(tokenName);\n`;
  code += `const metadata = { [policyId]: { [tokenName]: { ...demoAssetMetadata } } };\n`;
  code += `\n`;
  code += txbuilderCode;
  code += `const unsignedTx = await txBuilder\n`;
  code += `  .mintPlutusScriptV2()\n`;
  code += `  .mint("1", policyId, tokenNameHex)\n`;
  code += `  .mintingScript(demoPlutusMintingScript)\n`;
  code += `  .mintRedeemerValue(mConStr0(['${userInput}']))\n`;
  code += `  .metadataValue(721, metadata)\n`;
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
