import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletGetRewardAddresses() {
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
  const { getWallet } = useMeshWallet();
  async function runDemo() {
    const wallet = getWallet();
    let results = wallet.getRewardAddresses();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Reward Addresses"
      subtitle="Get stake addresses"
      code={`const rewardAddresses = wallet.getRewardAddresses();`}
      runCodeFunction={runDemo}
    />
  );
}
