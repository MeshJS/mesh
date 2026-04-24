import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetUtxos() {
  return (
    <TwoColumnsScroll
      sidebarTo="getUtxos"
      title="Get UTXOs"
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
  example += `      "outputIndex": 0,\n`;
  example += `      "txHash": "16dcbb1f93b4f9d5e...9106c7b121463c210ba"\n`;
  example += `    },\n`;
  example += `    "output": {\n`;
  example += `      "address": "addr_test1qzag7whju08xwrq...z0fr8c3grjmysgaw9y8",\n`;
  example += `      "amount": [\n`;
  example += `        {\n`;
  example += `          "unit": "lovelace",\n`;
  example += `          "quantity": "1314550"\n`;
  example += `        },\n`;
  example += `        {\n`;
  example += `          "unit": "f05c91a850...3d824d657368546f6b656e3032",\n`;
  example += `          "quantity": "1"\n`;
  example += `        }\n`;
  example += `      ]\n`;
  example += `    }\n`;
  example += `  }\n`;
  example += `]\n`;
  return (
    <>
      <p>
        Return a list of all UTXOs (unspent transaction outputs) controlled by
        the wallet. For example:
      </p>
      <Codeblock data={example} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    let results = await wallet.getUtxos();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get UTXOs"
      subtitle="Get UTXOs of the connected wallet"
      code={`const utxos = await wallet.getUtxos();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
