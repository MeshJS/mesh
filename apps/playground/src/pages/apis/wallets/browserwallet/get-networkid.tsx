import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function BrowserWalletGetNetworkId() {
  return (
    <TwoColumnsScroll
      sidebarTo="getNetworkId"
      title="Get Network ID"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        This API retrieves the network ID of the currently connected account. The
        network ID indicates the blockchain network the wallet is connected to. For
        example:
      </p>
      <ul>
        <li>
          <code>0</code>: Testnet
        </li>
        <li>
          <code>1</code>: Mainnet
        </li>
      </ul>
      <p>
        Other network IDs may be returned by wallets, but these are not governed
        by CIP-30. The network ID remains consistent unless the connected account
        changes.
      </p>
      <p>
        Applications can use this information to ensure compatibility with the
        connected network.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    let results = await wallet.getNetworkId();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Network ID"
      subtitle="Get currently connected network"
      code={`await wallet.getNetworkId();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
