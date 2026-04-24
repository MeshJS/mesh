import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function LeqComparator() {
  return (
    <TwoColumnsScroll
      sidebarTo="LeqComparator"
      title="Comparator - check if the value is less than or equal to another value with parameters - other"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>leq</code> Check if the value is less than or equal to another
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
  async function runleqDemo() {
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
    return value.leq(target);
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
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
  return value.leq(target);
  `;

  return (
    <>
      <LiveCodeDemo
        title="leq"
        subtitle="Check if the value is less than or equal to another value with parameters - other"
        code={code}
        runCodeFunction={runleqDemo}
      />
    </>
  );
}
