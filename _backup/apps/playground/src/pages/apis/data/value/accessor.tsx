import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { mockUnit } from "./";

export default function ValueAccessor() {
  return (
    <TwoColumnsScroll
      sidebarTo="ValueAccessor"
      title="Value Methods for Accessing Mesh Data"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <Section1 />
      <Section2 />
    </>
  );
}

function Section1() {
  return (
    <>
      <p>
        <code>get</code> get the quantity of asset object per unit, with
        parameters
      </p>
      <ul>
        <li>
          <b>unit</b> - the unit of the assets e.g. lovelace
        </li>
      </ul>
    </>
  );
}

function Section2() {
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
  return (
    <>
      <LiveCodeDemo
        title="Get"
        subtitle="Get the quantity of asset object per lovelace unit"
        code={getCode()}
        runCodeFunction={runGetDemo}
      />
      <LiveCodeDemo
        title="Units"
        subtitle="Get all asset units with no parameters needed"
        code={getCode2()}
        runCodeFunction={runUnitsDemo}
      />
    </>
  );
}

function getCode() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue({ lovelace: 20n });
  return value.get("lovelace");
  `;
}

async function runGetDemo() {
  const value = new MeshValue({ lovelace: 20n });
  value.get("lovelace");
  return value;
}

function getCode2() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue({ 
    lovelace: 20n, 
    [mockUnit]: 10n,
  });
  return value.units();
  `;
}

async function runUnitsDemo() {
  const value = new MeshValue({
    lovelace: 20n,
    [mockUnit]: 10n,
  });
  return value.units();
}
