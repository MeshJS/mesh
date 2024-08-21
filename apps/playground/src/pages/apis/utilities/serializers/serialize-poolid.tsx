import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function SerializePoolId() {
  return (
    <TwoColumnsScroll
      sidebarTo="serializePoolId"
      title="Serialize Pool ID"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Resolve the pool ID from hash.</p>
    </>
  );
}

function Right() {
  async function runDemo() {
    // return serializePoolId(address);
  }

  let codeSnippet = ``;

  return (
    <LiveCodeDemo
      title="Serialize Pool ID"
      subtitle="Resolve the pool ID from hash"
      code={codeSnippet}
      runCodeFunction={runDemo}
    ></LiveCodeDemo>
  );
}
