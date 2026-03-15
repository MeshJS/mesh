import { Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TransactionSendValue() {
  return (
    <TwoColumnsScroll
      sidebarTo="sendValue"
      title="Send Value"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeUtxo = ``;
  codeUtxo += `{\n`;
  codeUtxo += `  input: {\n`;
  codeUtxo += `      outputIndex: number;\n`;
  codeUtxo += `      txHash: string;\n`;
  codeUtxo += `  };\n`;
  codeUtxo += `  output: {\n`;
  codeUtxo += `      address: string;\n`;
  codeUtxo += `      amount: Asset[];\n`;
  codeUtxo += `      dataHash?: string;\n`;
  codeUtxo += `      plutusData?: string;\n`;
  codeUtxo += `      scriptRef?: string;\n`;
  codeUtxo += `  };\n`;
  codeUtxo += `}\n`;

  return (
    <>
      <p>
        Specify an output for the transaction. This funcion allows you to design
        the output UTXOs, either by splitting the outputs from multiple UTxOs or
        by creating reference inputs.
      </p>
      <p>
        <code>sendValue()</code> is useful when working with smart contracts,
        when you want to redeem a UTxO from the script.
      </p>
      <Codeblock data={`tx.sendValue(address: Recipient, value: UTxO);`} />
      <p>
        where <code>UTxO</code> has the following format (use one of our
        providers):
      </p>
      <Codeblock data={codeUtxo} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const utxo = utxos[0];

    if (utxo) {
      const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
      tx.sendValue(await wallet.getChangeAddress(), utxo);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);

      return txHash;
    } else {
      return "No UTXO found";
    }
  }

  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.sendValue(recipient, UTxO);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <LiveCodeDemo
      title="Send value"
      subtitle="Add UTXO as input and send to a recipient.  In this demo, the first UTXO from your wallet is selected."
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
