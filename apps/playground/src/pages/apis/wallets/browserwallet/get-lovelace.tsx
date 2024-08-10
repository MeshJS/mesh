import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function BrowserWalletGetLovelace() {
  return (
    <TwoColumnsScroll
      sidebarTo="getLovelace"
      title="Get Lovelace"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Return the lovelace balance in wallet. 1 ADA = 1000000 lovelace.</p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  async function runDemo() {
    let results = await wallet.getLovelace();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Lovelace"
      subtitle="Get amount of ADA in connected wallet"
      code={`await wallet.getLovelace();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
