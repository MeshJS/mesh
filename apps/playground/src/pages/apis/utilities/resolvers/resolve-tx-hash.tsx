import { resolveTxHash, Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { getMeshWallet } from "~/components/cardano/mesh-wallet";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAddresses } from "~/data/cardano";

export default function ResolveTxHash() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveTxHash"
      title="Resolve Transaction Hash"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Provide a <code>cborTx</code>, <code>resolveTxHash</code> will return
        the transaction hash. This hash is useful for creating chain
        transactions.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.sendLovelace(demoAddresses.testnet, "1500000");
    const unsignedTx = await tx.build();
    const hash1 = resolveTxHash(unsignedTx);

    const signedTx = await wallet.signTx(unsignedTx, false);
    const hash2 = resolveTxHash(signedTx);

    const txHash = await wallet.submitTx(signedTx);

    return { hash1, hash2, txHash };
  }

  let codeSnippet = ``;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.sendLovelace('${demoAddresses.testnet}', '1500000');\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const hash1 = resolveTxHash(unsignedTx);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx, false);\n`;
  codeSnippet += `const hash2 = resolveTxHash(signedTx);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n\n`;
  codeSnippet += `// txHash == hash1 == hash2`;

  return (
    <LiveCodeDemo
      title="Resolve Transaction Hash"
      subtitle="Convert transaction cborTx to transaction hash"
      code={codeSnippet}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
