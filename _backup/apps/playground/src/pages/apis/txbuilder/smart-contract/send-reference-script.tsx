import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses, demoPlutusAlwaysSucceedScript } from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

export default function TxbuilderContractSendReferenceScript() {
  return (
    <TwoColumnsScroll
      sidebarTo="TxbuilderContractSendReferenceScript"
      title="Send Reference Scripts Onchain"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        For all smart contract executions, you have option to provide script as
        referencing onchain. To do so, you must send the script onchain first.
        You can attach the script like attaching datum to a output with this:
      </p>
      <Codeblock
        data={`.txOutReferenceScript(scriptCbor: string, version?: LanguageVersion)`}
      />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();
    const txBuilder = getTxBuilder();
    const unsignedTx = await txBuilder
      .txOut(demoAddresses.testnet, [])
      .txOutReferenceScript(demoPlutusAlwaysSucceedScript, "V2")
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = ``;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `const unsignedTx = await txBuilder\n`;
  codeSnippet += `  .txOut("${demoAddresses.testnet}", [])\n`;
  codeSnippet += `  .txOutReferenceScript("${demoPlutusAlwaysSucceedScript}", "V2")\n`;
  codeSnippet += `  .changeAddress(changeAddress)\n`;
  codeSnippet += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet += `  .complete();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Send Reference Script"
      subtitle="Provide script as referencing onchain"
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
