import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function SerializeAddressObj() {
  return (
    <TwoColumnsScroll
      sidebarTo="serializeAddressObj"
      title="Serialize Address Object"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Serialize address in Cardano data JSON format into bech32 address.</p>
    </>
  );
}

function Right() {
  async function runDemo() {
    // return serializeAddressObj(address);
  }

  let codeSnippet = ``;

  return (
    <LiveCodeDemo
      title="Serialize Address Object"
      subtitle="Serialize address in Cardano data JSON format into bech32 address"
      code={codeSnippet}
      runCodeFunction={runDemo}
    ></LiveCodeDemo>
  );
}
