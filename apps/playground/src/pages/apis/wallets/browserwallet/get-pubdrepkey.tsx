import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetPubdrepkey() {
  return (
    <TwoColumnsScroll
      sidebarTo="getPubdrepkey"
      title="Get DRep ID Key"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSample = ``;
  codeSample += `[\n`;
  codeSample += `  {\n`;
  codeSample += `    "cip": 30\n`;
  codeSample += `  }\n`;
  codeSample += `]\n`;

  return (
    <>
      <p>Get a list of CIPs that are supported by the connected wallet.</p>
      <p>Example:</p>
      <Codeblock data={codeSample} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const results = await wallet.getPubDRepKey();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get DRep ID Key"
      subtitle="Get the key, hash, and bech32 address of the DRep ID"
      code={`await wallet.getPubDRepKey();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
