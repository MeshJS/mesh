import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function SerializeRewardAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="serializeRewardAddress"
      title="Serialize Reward Address"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Serialize a script hash or key hash into bech32 reward address.</p>
    </>
  );
}

function Right() {
  async function runDemo() {
    // return serializeRewardAddress(address);
  }

  let codeSnippet = ``;

  return (
    <LiveCodeDemo
      title="Serialize Reward Address"
      subtitle="Serialize a script hash or key hash into bech32 reward address"
      code={codeSnippet}
      runCodeFunction={runDemo}
    ></LiveCodeDemo>
  );
}
