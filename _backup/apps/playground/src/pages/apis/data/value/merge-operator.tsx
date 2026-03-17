import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function MergeOperator() {
  return (
    <TwoColumnsScroll
      sidebarTo="MergeOperator"
      title="Operator - merge the given values with parameters - values"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>merge</code> Merge the given values
      </p>
      <ul>
        <b>values</b> - The other values to merge
      </ul>
    </>
  );
}

function Right() {
  async function runmergeDemo() {
    const value1 = new MeshValue();
    value1.value = {
      lovelace: 20n,
      baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234: 10n,
    };
    const value2 = new MeshValue();
    value2.value = {
      lovelace: 10n,
      baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234: 5n,
    };
    return value1.merge(value2).value;
  }

  let code = `
  const value1 = new MeshValue();
  value1.value = { lovelace: 20n, "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234": 10n };
  const value2 = new MeshValue();
  value2.value = { lovelace: 10n, "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234": 5n };
  return value1.merge(value2).value;
  `;

  return (
    <>
      <LiveCodeDemo
        title="merge"
        subtitle="Merge the given values with parameters - values"
        code={code}
        runCodeFunction={runmergeDemo}
      />
    </>
  );
}
