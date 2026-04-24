import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function PaymentSplitterTriggerPayout() {
  return (
    <TwoColumnsScroll
      sidebarTo="triggerPayout"
      title="Trigger Payout"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>triggerPayout()</code> will split the locked amount equally among
        the list of payees. The function doesn't need any parameters.
      </p>
      <p>
        The function returns a transaction hash if the payout has been done
        successfully.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const contract = getContract(wallet);

    const tx = await contract.triggerPayout();
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.triggerPayout();\n`;
  code += `const signedTx = await wallet.signTx(tx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Trigger Payout"
      subtitle="After the amount has been locked in the contract, you can trigger the payout to the payees."
      runCodeFunction={runDemo}
      code={code}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    ></LiveCodeDemo>
  );
}
