import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import useAppWallet from "~/contexts/app-wallet";

export default function AppWalletGetRewardAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="getRewardAddress"
      title="Get Reward Address"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Get wallet's reward address. For multi-addresses wallet, it will return
        the first address. To choose other address, `accountIndex` can be
        specified.
      </p>
    </>
  );
}

function Right() {
  const { wallet, walletConnected } = useAppWallet();

  async function runDemo() {
    return wallet.getRewardAddress();
  }

  return (
    <LiveCodeDemo
      title="Get Reward Address"
      subtitle="Get wallet's reward address. For multi-addresses wallet, it will return the first address. To choose other address, `accountIndex` can be specified."
      code={`const address = wallet.getRewardAddress();\n`}
      runCodeFunction={runDemo}
      disabled={!walletConnected}
      runDemoButtonTooltip={
        !walletConnected ? "Connect wallet to run this demo" : undefined
      }
    />
  );
}
