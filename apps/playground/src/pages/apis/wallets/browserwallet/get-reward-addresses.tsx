import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetRewardAddresses() {
  return (
    <TwoColumnsScroll
      sidebarTo="getRewardAddresses"
      title="Get Reward Addresses"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  "stake_test1uzx0ksy9f4qnj2mzfdncqyjy84sszh64w43853nug5pedjgytgke9"\n`;
  example += `]\n`;

  return (
    <>
      <p>
        Returns a list of reward addresses owned by the wallet. A reward address
        is a stake address that is used to receive rewards from staking,
        generally starts from `stake` prefix. Example:
      </p>
      <Codeblock data={example} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    let results = await wallet.getRewardAddresses();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Reward Addresses"
      subtitle="Get stake addresses"
      code={`await wallet.getRewardAddresses();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
