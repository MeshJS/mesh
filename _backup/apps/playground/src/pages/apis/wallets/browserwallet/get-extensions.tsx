import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetExtensions() {
  return (
    <TwoColumnsScroll
      sidebarTo="getExtensions"
      title="Get Extensions"
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
      <p>
        This API retrieves a list of CIP-30 extensions enabled by the connected
        wallet. CIP-30 extensions define additional capabilities that wallets
        can support, enhancing their functionality.
      </p>
      <p>
        Applications can use this information to determine the features
        supported by the wallet and adapt their behavior accordingly.
      </p>
      <p>Example response:</p>
      <Codeblock data={codeSample} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    let results = await wallet.getExtensions();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Extensions"
      subtitle="Get a list of CIPs that are supported by the connected wallet"
      code={`await wallet.getExtensions();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
