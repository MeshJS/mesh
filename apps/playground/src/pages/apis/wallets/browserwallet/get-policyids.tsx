import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetPolicyIds() {
  return (
    <TwoColumnsScroll
      sidebarTo="getPolicyIds"
      title="Get Policy IDs"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  "0f5560dbc05282e05507aedb02d823d9d9f0e583cce579b81f9d1cd8",\n`;
  example += `  "5bed9e89299c69d9a54bbc82d88aa5a86698b2b7b9d0ed030fc4b0ff",\n`;
  example += `  "9c8e9da7f81e3ca90485f32ebefc98137c8ac260a072a00c4aaf142d",\n`;
  example += `]\n`;
  return (
    <>
      <p>
        This API retrieves a list of policy IDs for all assets in the connected wallet. A policy ID is a unique identifier for a group of assets, often used to manage collections or verify asset ownership.
      </p>
      <p>
        Applications can use this information to query assets belonging to specific policy IDs or display asset details to the user.
      </p>
      <p>Example response:</p>
      <Codeblock data={example} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    let results = await wallet.getPolicyIds();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Policy IDs"
      subtitle="Get a list of policy IDs from all assets in wallet"
      code={`await wallet.getPolicyIds();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
