import { Data, Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getAssetUtxo, getScript, getWalletAddress } from "../common";

export default function AikenRedeem() {
  return (
    <TwoColumnsScroll
      sidebarTo="redeem"
      title="Create transaction to redeem tokens"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeDatum = ``;
  codeDatum += `const datum: Data = {\n`;
  codeDatum += `  alternative: 0,\n`;
  codeDatum += `  fields: [hash],\n`;
  codeDatum += `};\n`;

  let codeUtxo = ``;
  codeUtxo += `async function getAssetUtxo({\n`;
  codeUtxo += `  scriptAddress,\n`;
  codeUtxo += `  asset,\n`;
  codeUtxo += `  datum,\n`;
  codeUtxo += `}: {\n`;
  codeUtxo += `  scriptAddress: string;\n`;
  codeUtxo += `  asset: string;\n`;
  codeUtxo += `  datum: any;\n`;
  codeUtxo += `}) {\n`;
  codeUtxo += `  const provider = getProvider();\n`;
  codeUtxo += `  const utxos = await provider.fetchAddressUTxOs(\n`;
  codeUtxo += `    scriptAddress,\n`;
  codeUtxo += `    asset,\n`;
  codeUtxo += `  );\n`;
  codeUtxo += `\n`;
  codeUtxo += `  const dataHash = resolveDataHash(datum);\n`;
  codeUtxo += `\n`;
  codeUtxo += `  let utxo = utxos.find((utxo: any) => {\n`;
  codeUtxo += `    return utxo.output.dataHash == dataHash;\n`;
  codeUtxo += `  });\n`;
  codeUtxo += `\n`;
  codeUtxo += `  return utxo;\n`;
  codeUtxo += `}\n`;

  let codeUtxo2 = ``;
  codeUtxo2 += `const assetUtxo = await getAssetUtxo({\n`;
  codeUtxo2 += `  scriptAddress: scriptAddress,\n`;
  codeUtxo2 += `  asset: "lovelace",\n`;
  codeUtxo2 += `  datum: datum,\n`;
  codeUtxo2 += `});\n`;

  let codeTransaction = ``;
  codeTransaction += `const redeemer = { data: { alternative: 0, fields: ["Hello, World!"] } };\n`;
  codeTransaction += `\n`;
  codeTransaction += `const tx = new Transaction({ initiator: wallet })\n`;
  codeTransaction += `  .redeemValue({\n`;
  codeTransaction += `    value: assetUtxo,\n`;
  codeTransaction += `    script: script,\n`;
  codeTransaction += `    datum: datum,\n`;
  codeTransaction += `    redeemer: redeemer,\n`;
  codeTransaction += `  })\n`;
  codeTransaction += `  .sendValue(address, assetUtxo)\n`;
  codeTransaction += `  .setRequiredSigners([address]);\n`;
  codeTransaction += `\n`;
  codeTransaction += `const unsignedTx = await tx.build();\n`;
  codeTransaction += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  codeTransaction += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        In this section, we will walk you through the process of creating a
        transaction to redeem tokens.
      </p>
      <p>
        First, we need to get the script and script address. We can do this by
        calling the function we created in the previous section.
      </p>
      <Codeblock
        data={`const { script, scriptAddress } = await getScript();`}
      />
      <p>
        Next, we need to get the wallet address and its hash. We can do this by
        calling the function we created in the previous section.
      </p>
      <Codeblock
        data={`const { address, hash } = await getWalletAddress(wallet);`}
      />
      <p>
        As the contracts requires the owner's address in the datum field, we are
        creating a new datum with the owner's address. We create the{" "}
        <code>Data</code> (datum) object containing the address hash:
      </p>
      <Codeblock data={codeDatum} />
      <p>After that, we get the UTXO in the script based on the datum:</p>
      <Codeblock data={codeUtxo} />
      <Codeblock data={codeUtxo2} />
      <p>Finally, we prepare the transaction to redeem the tokens:</p>
      <Codeblock data={codeTransaction} />
      <p>
        Here you notice that in the <code>redeemer</code>. As the validator
        requires, here we specify <code>Hello, World!</code>, which is the
        message we need to provide to unlock the tokens.
      </p>
      <p>
        For the transaction, we use the <code>redeemValue</code> function to
        redeem the locked assets, the <code>sendValue</code> function to send
        the assets to the owner's address, and the{" "}
        <code>setRequiredSigners</code> function to set the required signers.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const { script, scriptAddress } = await getScript();

    const { address, hash } = await getWalletAddress(wallet);

    const datum: Data = {
      alternative: 0,
      fields: [hash],
    };

    const assetUtxo = await getAssetUtxo({
      scriptAddress: scriptAddress,
      asset: "lovelace",
      datum: datum,
    });

    if (assetUtxo === undefined) {
      throw new Error("No utxo found");
    }

    const redeemer = { data: { alternative: 0, fields: ["Hello, World!"] } };

    const tx = new Transaction({ initiator: wallet })
      .setNetwork("preprod")
      .redeemValue({
        value: assetUtxo,
        script: script,
        datum: datum,
        redeemer: redeemer,
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
      title="Redeem Assets"
      subtitle="Create the transactions to unlock assets"
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    ></LiveCodeDemo>
  );
}
