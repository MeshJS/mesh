import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetCollateral() {
  return (
    <TwoColumnsScroll
      sidebarTo="getCollateral"
      title="Get Collateral"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  {\n`;
  example += `    "input": {\n`;
  example += `      "outputIndex": 1,\n`;
  example += `      "txHash": "ff8d1e97c60989b4f...02ee937595ad741ff597af1"\n`;
  example += `    },\n`;
  example += `    "output": {\n`;
  example += `      "address": "addr_test1qzm...z0fr8c3grjmysm5e6yx",\n`;
  example += `      "amount": [ { "unit": "lovelace", "quantity": "5000000" } ]\n`;
  example += `    }\n`;
  example += `  }\n`;
  example += `]\n`;
  return (
    <>
      <p>
        This API retrieves a list of UTXOs (unspent transaction outputs) controlled by the wallet that can be used as collateral inputs for transactions involving Plutus scripts. The returned UTXOs must meet or exceed the specified ADA value target.
      </p>
      <p>
        If the target cannot be met, an error message will be returned explaining the issue. Wallets may return UTXOs with a greater total ADA value than requested but must never return UTXOs with a smaller total value.
      </p>
      <p>
        This functionality is essential for applications that need to create transactions requiring collateral inputs.
      </p>
      <p>Example response:</p>
      <Codeblock data={example} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    let results = await wallet.getCollateral();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Collateral"
      subtitle="Get list of UTXOs that used as collateral inputs for transactions
            with plutus script inputs"
      code={`await wallet.getCollateral();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
