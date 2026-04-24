import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function UnitsAccessor() {
  return (
    <TwoColumnsScroll
      sidebarTo="UnitsAccessor"
      title="Accessor - get all asset units with no parameters needed"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>units</code> get all asset units with no parameters (e.g. unit)
        needed
      </p>
    </>
  );
}

function Right() {
  async function rungetDemo() {
    const value = new MeshValue({
      lovelace: 20n,
      baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234: 10n,
    });
    return value.units();
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue({
      lovelace: 20n,
      "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234": 10n,
      });
  return value.units();
  `;

  return (
    <>
      <LiveCodeDemo
        title="units"
        subtitle="Get all asset units with no parameters needed"
        code={code}
        runCodeFunction={rungetDemo}
      />
    </>
  );
}
