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
  codeSample += `{\n`;
  codeSample += `  "pubDRepKey": "6984e406dd81...39e43d798fe1a89ab",\n`;
  codeSample += `  "dRepIDHash": "9f7f4b78...df83bd227e943e9808450",\n`;
  codeSample += `  "dRepIDBech32": "drep1vz0h7jmc...0axqgg5q4dls5u"\n`;
  codeSample += `}\n`;

  return (
    <>
      <p>
        Get the key, hash, and bech32 encoding of the DRep ID. The DRep ID is a
        unique identifier for the user&apos;s wallet.
      </p>
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
