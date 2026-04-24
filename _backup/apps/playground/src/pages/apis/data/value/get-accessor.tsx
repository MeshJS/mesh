import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function GetAccessor() {
  return (
    <TwoColumnsScroll
      sidebarTo="GetAccessor"
      title="Accessor - get the quantity of asset object per lovelace unit"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>get</code> get the quantity of asset object per unit, with
        parameters
      </p>
      <ul>
        <li>
          <b>unit</b> - the unit to get the quantity of the assets e.g. lovelace
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function rungetDemo() {
    const value = new MeshValue({ lovelace: 20n });
    value.get("lovelace");
    return value;
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue({ lovelace: 20n });
  value.get("lovelace");
  return value;
 `;

  return (
    <>
      <LiveCodeDemo
        title="get"
        subtitle="Get the quantity of asset object per unit"
        code={code}
        runCodeFunction={rungetDemo}
      />
    </>
  );
}
