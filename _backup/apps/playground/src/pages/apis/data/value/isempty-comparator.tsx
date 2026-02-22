import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function IsemptyComparator() {
  return (
    <TwoColumnsScroll
      sidebarTo="IsemptyComparator"
      title="Comparator - check if the value is empty"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>isEmpty</code> Check if the value is empty
      </p>
    </>
  );
}

function Right() {
  async function runisemptyDemo() {
    const value = new MeshValue();
    return value.isEmpty();
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue();
  return value.isEmpty();
  `;

  return (
    <>
      <LiveCodeDemo
        title="isEmpty"
        subtitle="Check if the value is empty"
        code={code}
        runCodeFunction={runisemptyDemo}
      />
    </>
  );
}
