import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import useAppWallet from "~/contexts/app-wallet";

export default function AppWalletGetPaymentAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="getPaymentAddress"
      title="Get Payment Address"
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
    return wallet.getPaymentAddress();
  }

  return (
    <LiveCodeDemo
      title="Get Payment Address"
      subtitle="Get wallet's address. For multi-addresses wallet, it will return the first address. To choose other address, `accountIndex` can be specified."
      code={`const address = wallet.getPaymentAddress();\n`}
      runCodeFunction={runDemo}
      disabled={!walletConnected}
      runDemoButtonTooltip={
        !walletConnected ? "Connect wallet to run this demo" : undefined
      }
    />
  );
}
