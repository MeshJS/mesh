import { useState } from "react";

import { AssetMetadata, Mint, PlutusScript, Transaction } from "@meshsdk/core";
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

export default function MintingPlutusScript() {
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

  codeSnippet1 += `const script: PlutusScript = {\n`;
  codeSnippet1 += `  code: '${demoPlutusMintingScript}',\n`;
  codeSnippet1 += `  version: "V2",\n`;
  codeSnippet1 += `};\n`;
  codeSnippet1 += `\n`;
  codeSnippet1 += `const redeemer = {\n`;
  codeSnippet1 += `  data: { alternative: 0, fields: ["${userInput}"] },\n`;
  codeSnippet1 += `};\n`;

  let codeSnippet2 = `const assetMetadata: AssetMetadata = ${JSON.stringify(
    demoAssetMetadata,
    null,
    2,
  )};\n\n`;
  codeSnippet2 += `const asset: Mint = {\n`;
  codeSnippet2 += `  assetName: 'MeshToken',\n`;
  codeSnippet2 += `  assetQuantity: '1',\n`;
  codeSnippet2 += `  metadata: assetMetadata,\n`;
  codeSnippet2 += `  label: '721',\n`;
  codeSnippet2 += `  recipient: '${demoAddresses.testnet}' \n`;
  codeSnippet2 += `};\n`;

  let codeSnippet3 = ``;
  codeSnippet3 += `const tx = new Transaction({ initiator: wallet })\n`;
  codeSnippet3 += `  .mintAsset(script, asset, redeemer)\n`;
  codeSnippet3 += `  .setRequiredSigners([address]);\n`;
  codeSnippet3 += `\n`;
  codeSnippet3 += `const unsignedTx = await tx.build();\n`;
  codeSnippet3 += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeSnippet3 += `const txHash = await wallet.submitTx(signedTx);\n`;

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
        the transaction. For this example, the validator script is expecting a
        redeemer with a data field of "mesh".
      </p>
      <Codeblock data={codeSnippet1} />
      <p>
        Similar to previous examples, we define the asset metadata and mint
        object. The asset metadata is a JSON object that contains the metadata
        for the asset. The mint object contains the asset name, quantity,
        metadata, label, and recipient address.
      </p>
      <Codeblock data={codeSnippet2} />
      <p>
        Finally, we create a transaction and mint the asset with the{" "}
        <code>mintAsset</code> method. We set the required signers to include
        the address that is minting the asset.
      </p>
      <Codeblock data={codeSnippet3} />
    </>
  );
}

function Right(userInput: string, setUserInput: (value: string) => void) {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];

    if (address === undefined) {
      throw "Address not found";
    }

    const assetMetadata: AssetMetadata = demoAssetMetadata;

    const asset: Mint = {
      assetName: "MeshToken",
      assetQuantity: "1",
      metadata: assetMetadata,
      label: "721",
      recipient: address,
    };

    const script: PlutusScript = {
      code: demoPlutusMintingScript,
      version: "V2",
    };

    const redeemer = {
      data: { alternative: 0, fields: [userInput] },
    };

    const tx = new Transaction({ initiator: wallet })
      .setNetwork("preprod")
      .mintAsset(script, asset, redeemer)
      .setRequiredSigners([address]);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let code = ``;
  code += `const usedAddress = await wallet.getUsedAddresses();\n`;
  code += `const address = usedAddress[0];\n`;
  code += `\n`;
  code += `const assetMetadata: AssetMetadata = ${JSON.stringify(
    demoAssetMetadata,
    null,
    2,
  )};\n\n`;
  code += `const asset: Mint = {\n`;
  code += `  assetName: "MeshToken",\n`;
  code += `  assetQuantity: "1",\n`;
  code += `  metadata: assetMetadata,\n`;
  code += `  label: "721",\n`;
  code += `  recipient: address,\n`;
  code += `};\n`;
  code += `\n`;
  code += `const script: PlutusScript = {\n`;
  code += `  code: demoPlutusMintingScript,\n`;
  code += `  version: "V2",\n`;
  code += `};\n`;
  code += `\n`;
  code += `const redeemer = {\n`;
  code += `  data: { alternative: 0, fields: ['${userInput}'] },\n`;
  code += `  tag: "MINT",\n`;
  code += `};\n`;
  code += `\n`;
  code += `const tx = new Transaction({ initiator: wallet })\n`;
  code += `  .mintAsset(script, asset, redeemer)\n`;
  code += `  .setRequiredSigners([address]);\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
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
