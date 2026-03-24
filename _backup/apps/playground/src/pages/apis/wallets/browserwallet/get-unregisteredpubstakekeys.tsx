import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function BrowserWalletGetUnregisteredPubStakeKeys() {
  return (
    <TwoColumnsScroll
      sidebarTo="getUnregisteredPubStakeKeys"
      title="Get Unregistered Pub Stake Keys"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Get a list of unregistered public stake keys.</p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const results = await wallet.getUnregisteredPubStakeKeys();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Unregistered Pub Stake Keys"
      subtitle="Get a list of unregistered public stake keys"
      code={`await wallet.getUnregisteredPubStakeKeys();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
