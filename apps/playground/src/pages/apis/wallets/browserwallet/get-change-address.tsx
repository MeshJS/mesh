import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function BrowserWalletGetChangeAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="getChangeAddress"
      title="Get Change Address"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Returns an address owned by the wallet that should be used as a change
        address to return leftover assets during transaction creation back to
        the connected wallet.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    let results = await wallet.getChangeAddress();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Change Address"
      subtitle="Get address that should be used for transaction's change"
      code={`await wallet.getChangeAddress();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
