import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetRegisteredpubstakekeys() {
  return (
    <TwoColumnsScroll
      sidebarTo="getRegisteredpubstakekeys"
      title="Get Registered Pub Stake Keys"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code = ``;
  code += `{\n`;
  code += `  "pubStakeKeys": [\n`;
  code += `    "d7eb3004c14647646...40f89c1a4b8a2eb0a3"\n`;
  code += `  ],\n`;
  code += `  "pubStakeKeyHashes": [\n`;
  code += `    "8cfb40854d41392b..5575627a467c450396c9"\n`;
  code += `  ]\n`;
  code += `}\n`;

  return (
    <>
      <p>Get a list of registered public stake keys.</p>
      <p>Example:</p>
      <Codeblock data={code} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const results = await wallet.getRegisteredPubStakeKeys();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Registered Pub Stake Keys"
      subtitle="Get a list of registered public stake keys"
      code={`await wallet.getRegisteredPubStakeKeys();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
