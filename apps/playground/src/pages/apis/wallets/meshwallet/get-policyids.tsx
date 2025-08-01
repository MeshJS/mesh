import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletGetPolicyIds() {
  return (
    <TwoColumnsScroll
      sidebarTo="getPolicyIds"
      title="Get Policy IDs"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  "0f5560dbc05282e05507aedb02d823d9d9f0e583cce579b81f9d1cd8",\n`;
  example += `  "5bed9e89299c69d9a54bbc82d88aa5a86698b2b7b9d0ed030fc4b0ff",\n`;
  example += `  "9c8e9da7f81e3ca90485f32ebefc98137c8ac260a072a00c4aaf142d",\n`;
  example += `]\n`;
  return (
    <>
      <p>
        This API retrieves a list of policy IDs from all assets in the wallet. A policy ID is a unique identifier that groups assets under a common policy.
      </p>
      <p>
        Policy IDs are useful for querying assets associated with specific policies. For example, you can use a policy ID to retrieve all assets belonging to that policy.
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
    let results = await wallet.getPolicyIds();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Policy IDs"
      subtitle="Get a list of policy IDs from all assets in wallet"
      code={`const policyIds = await wallet.getPolicyIds();`}
      runCodeFunction={runDemo}
    />
  );
}
