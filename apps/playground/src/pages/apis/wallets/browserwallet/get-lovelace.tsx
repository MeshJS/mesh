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
      <p>
        This API retrieves the Lovelace balance in the connected wallet. Lovelace is the smallest denomination of ADA, where 1 ADA equals 1,000,000 Lovelace.
      </p>
      <p>
        Applications can use this information to display the wallet's balance or perform operations involving ADA.
      </p>
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
