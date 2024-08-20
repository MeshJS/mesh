import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function LequnitComparator() {
  return (
    <TwoColumnsScroll
      sidebarTo="LequnitComparator"
      title="Comparator - check if the specific unit of value is less than or equal to that unit of another value with parameters - unit, other"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>leqUnit</code> Check if the specific unit of value is less than or
        equal to that unit of another value with parameters:
      </p>
      <ul>
        <li>
          <b>unit</b> - The unit to compare
        </li>
        <li>
          <b>other</b> - The MeshValue to compare against
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function runlequnitDemo() {
    const value = new MeshValue({
      lovelace: 20n,
      c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64:
        10n,
    });
    const target = new MeshValue({
      lovelace: 30n,
      c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64:
        15n,
    });
    const resultLovelace = value.leqUnit("lovelace", target);
    const resultmockvalue = value.leqUnit(
      "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64",
      target,
    );

    return { resultLovelace, resultmockvalue };
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue({
   lovelace: 20n,
   c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64: 10n,
  });
  const target = new MeshValue({
    lovelace: 30n,
    c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64: 15n,
  });
  const resultLovelace = value.leqUnit("lovelace", target);
  const resultmockvalue = value.leqUnit(
    "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64",
    target,
  );

  return { resultLovelace, resultmockvalue };
  `;

  return (
    <>
      <LiveCodeDemo
        title="lequnit"
        subtitle="Check if the specific unit of value is less than or equal to that unit of another value with parameters - unit, other"
        code={code}
        runCodeFunction={runlequnitDemo}
      />
    </>
  );
}
