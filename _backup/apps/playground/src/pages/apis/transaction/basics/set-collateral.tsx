import { Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TransactionSetCollateral() {
  return (
    <TwoColumnsScroll
      sidebarTo="collateral"
      title="Set Collateral"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Specify the UTXOs that you want to use as collateral.</p>
      <Codeblock data={`tx.setCollateral(collateral: UTxO[]);`} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const utxo = (await wallet.getUtxos())[0];

    if (utxo) {
      const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
      tx.setCollateral([utxo]);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);

      return txHash;
    } else {
      return "No UTXOs available";
    }
  }

  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.setCollateral([utxo]);\n\n`;

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <LiveCodeDemo
      title="Set collateral"
      subtitle="Set the UTXOs that you want to use as collateral. In this demo, the first UTXO from your wallet is selected."
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
