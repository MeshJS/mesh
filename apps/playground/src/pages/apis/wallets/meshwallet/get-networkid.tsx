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
        Returns the network ID of the currently connected account.{" "}
        <code>0</code> is testnet and <code>1</code> is mainnet but other
        networks can possibly be returned by wallets. Those other network ID
        values are not governed by CIP-30. This result will stay the same unless
        the connected account has changed.
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
