import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function GeqComparator() {
  return (
    <TwoColumnsScroll
      sidebarTo="GeqComparator"
      title="Comparator - check if the value is greater than or equal to another value with parameters - other"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>geq</code> Check if the value is greater than or equal to another
        value with parameters:
      </p>
      <ul>
        <li>
          <b>other</b> - The MeshValue to compare against
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function rungeqDemo() {
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
    return value.geq(target);
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue({
    lovelace: 20n,
    c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64: 10n,
    });
  const target = new MeshValue({
    lovelace: 10n,
    c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64: 5n,
    });
  return value.geq(target);
  `;

  return (
    <>
      <LiveCodeDemo
        title="geq"
        subtitle="Check if the value is greater than or equal to another value with parameters - other"
        code={code}
        runCodeFunction={rungeqDemo}
      />
    </>
  );
}
