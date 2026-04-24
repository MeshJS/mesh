import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function GequnitComparator() {
  return (
    <TwoColumnsScroll
      sidebarTo="GequnitComparator"
      title="Comparator - check if the value is greater than or equal to another value with parameters - unit, other"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>geqUnit</code> Check if the value is greater than or equal to
        another value with parameters:
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
  async function rungequnitDemo() {
    const value = new MeshValue({
      lovelace: 20n,
      c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64:
        10n,
    });
    const target = new MeshValue({
      lovelace: 10n,
      c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64:
        5n,
    });
    const resultLovelace = value.geqUnit("lovelace", target);
    const resultmockvalue = value.geqUnit(
      "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64",
      target,
    );

    return { resultLovelace, resultmockvalue };
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue({
      lovelace: 20n,
      c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64:
          10n,
      });
  const target = new MeshValue({
      lovelace: 10n,
      c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64:
          5n,
      });
  const resultLovelace = value.geqUnit("lovelace", target);
  const resultmockvalue = value.geqUnit(
      "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64",
      target,
      );
  
  return { resultLovelace, resultmockvalue };
  }
  `;

  return (
    <>
      <LiveCodeDemo
        title="geqUnit"
        subtitle="Check if the value is greater than or equal to another value with parameters - unit, other"
        code={code}
        runCodeFunction={rungequnitDemo}
      />
    </>
  );
}
