import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletGetLovelace() {
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
  const { getWallet } = useMeshWallet();
  async function runDemo() {
    const wallet = getWallet();
    let results = await wallet.getLovelace();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Lovelace"
      subtitle="Get amount of ADA in connected wallet"
      code={`const lovelace = await wallet.getLovelace();`}
      runCodeFunction={runDemo}
    />
  );
}
