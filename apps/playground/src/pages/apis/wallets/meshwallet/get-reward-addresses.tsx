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
        This API retrieves a list of reward addresses owned by the wallet. Reward addresses are stake addresses used to receive rewards from staking activities.
      </p>
      <p>
        Reward addresses typically start with the `stake` prefix, making them easily identifiable. These addresses are essential for tracking staking rewards and managing staking operations.
      </p>
      <p>Example response:</p>
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
