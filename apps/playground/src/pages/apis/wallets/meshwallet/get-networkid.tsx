import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletGetNetworkId() {
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
        This API returns the network ID of the currently connected account. The
        network ID indicates the environment in which the wallet is operating:
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
    </>
  );
}

function Right() {
  const { getWallet } = useMeshWallet();
  async function runDemo() {
    const wallet = getWallet();
    let results = wallet.getNetworkId();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Network ID"
      subtitle="Get currently connected network"
      code={`const networkId = wallet.getNetworkId();`}
      runCodeFunction={runDemo}
    />
  );
}
