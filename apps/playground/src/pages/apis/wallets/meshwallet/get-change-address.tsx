import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletGetChangeAddress() {
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
  const { getWallet } = useMeshWallet();
  async function runDemo() {
    const wallet = getWallet();
    let results = await wallet.getChangeAddress();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Change Address"
      subtitle="Get address that should be used for transaction's change"
      code={`const changeAddress = await wallet.getChangeAddress();`}
      runCodeFunction={runDemo}
    />
  );
}
