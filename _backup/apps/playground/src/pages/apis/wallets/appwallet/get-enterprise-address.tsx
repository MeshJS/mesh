import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import useAppWallet from "~/contexts/app-wallet";

export default function AppWalletGetEnterpriseAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="getEnterpriseAddress"
      title="Get Enterprise Address"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Get wallet's address. For multi-addresses wallet, it will return the
        first address. To choose other address, `accountIndex` can be specified.
      </p>
    </>
  );
}

function Right() {
  const { wallet, walletConnected } = useAppWallet();

  async function runDemo() {
    return wallet.getEnterpriseAddress();
  }

  return (
    <LiveCodeDemo
      title="Get Enterprise Address"
      subtitle="Get wallet's address. For multi-addresses wallet, it will return the first address. To choose other address, `accountIndex` can be specified."
      code={`const address = wallet.getEnterpriseAddress();\n`}
      runCodeFunction={runDemo}
      disabled={!walletConnected}
      runDemoButtonTooltip={
        !walletConnected ? "Connect wallet to run this demo" : undefined
      }
    />
  );
}
