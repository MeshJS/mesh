import { useState } from "react";

import {
  PlutusScript,
  serializePlutusScript,
  Transaction,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { fetchAssetUtxo } from "~/components/cardano/fetch-utxo-by-datum";
import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset, demoPlutusAlwaysSucceedScript } from "~/data/cardano";

export default function ContractUnlockAssets() {
  return (
    <TwoColumnsScroll
      sidebarTo="unlockAssets"
      title="Unlock assets in Smart Contract"
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

  let codeSnippetCreateTx = "";
  codeSnippetCreateTx += `// create the unlock asset transaction\n`;
  codeSnippetCreateTx += `const tx = new Transaction({ initiator: wallet })\n`;
  codeSnippetCreateTx += `  .redeemValue({\n`;
  codeSnippetCreateTx += `    value: assetUtxo,\n`;
  codeSnippetCreateTx += `    script: {\n`;
  codeSnippetCreateTx += `      version: 'V2',\n`;
  codeSnippetCreateTx += `      code: '${demoPlutusAlwaysSucceedScript}',\n`;
  codeSnippetCreateTx += `    },\n`;
  codeSnippetCreateTx += `    datum: '<DATUM_HERE>',\n`;
  codeSnippetCreateTx += `  })\n`;

  codeSnippetCreateTx += `  .sendValue(address, assetUtxo) // address is recipient address\n`;
  codeSnippetCreateTx += `  .setRequiredSigners([address]);\n`;

  let codeSnippetSign = `const unsignedTx = await tx.build();\n`;
  codeSnippetSign += `// note that the partial sign is set to true\n`;
  codeSnippetSign += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeSnippetSign += `const txHash = await wallet.submitTx(signedTx);`;

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

  let code = ``;

  code += `// script\n`;
  code += `const script: PlutusScript = {\n`;
  code += `  code: '${demoPlutusAlwaysSucceedScript}',\n`;
  code += `  version: "V2",\n`;
  code += `};\n`;
  code += `const { address: scriptAddress } = serializePlutusScript(script);\n`;
  code += `\n`;
  code += `// retrieve asset utxo\n`;
  code += `const assetUtxo = await fetchAssetUtxo({\n`;
  code += `  address: scriptAddress,\n`;
  code += `  asset: '${userInput}',\n`;
  code += `  datum: '${userInput2}',\n`;
  code += `});\n`;
  code += `\n`;
  code += `if (assetUtxo === undefined) {\n`;
  code += `  throw "Asset UTXO not found";\n`;
  code += `}\n`;
  code += `\n`;
  code += `// transaction\n`;
  code += `\n`;
  code += `const address = await wallet.getChangeAddress();\n`;
  code += `\n`;
  code += `const tx = new Transaction({ initiator: wallet })\n`;
  code += `  .redeemValue({\n`;
  code += `    value: assetUtxo,\n`;
  code += `    script: script as PlutusScript,\n`;
  code += `    datum: '${userInput2}',\n`;
  code += `  })\n`;
  code += `  .sendValue(address, assetUtxo)\n`;
  code += `  .setRequiredSigners([address]);\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  async function runDemo() {
    // script
    const script: PlutusScript = {
      code: demoPlutusAlwaysSucceedScript,
      version: "V2",
    };
    const { address: scriptAddress } = serializePlutusScript(script);

    // retrieve asset utxo
    const assetUtxo = await fetchAssetUtxo({
      address: scriptAddress,
      asset: userInput,
      datum: userInput2,
    });

    if (assetUtxo === undefined) {
      throw "Asset UTXO not found";
    }

    // transaction

    const address = await wallet.getChangeAddress();

    const tx = new Transaction({ initiator: wallet })
      .setNetwork("preprod")
      .redeemValue({
        value: assetUtxo,
        script: script as PlutusScript,
        datum: userInput2,
      })
      .sendValue(address, assetUtxo)
      .setRequiredSigners([address]);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  return (
    <LiveCodeDemo
      title="Unlock assets in Smart Contract"
      subtitle="In this demo, we will unlock the asset that we have locked in the previous demo."
      runCodeFunction={runDemo}
      code={code}
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
            placeholder="Asset Unit"
            label="Asset Unit"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Datum"
            label="Datum"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
