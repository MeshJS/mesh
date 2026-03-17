import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function ValueComparator() {
  return (
    <TwoColumnsScroll
      sidebarTo="ValueComparator"
      title="Value Methods for Comparing Mesh Data"
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
      <Section3 />
      <Section4 />
      <Section5 />
    </>
  );
}

function Section1() {
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

function Section2() {
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

function Section3() {
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

function Section4() {
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

function Section5() {
  return (
    <>
      <p>
        <code>isEmpty</code> Check if the value is empty
      </p>
    </>
  );
}

function Right() {
  return (
    <>
      <LiveCodeDemo
        title="geq"
        subtitle="Check if the value is greater than or equal to another value with parameters - other"
        code={getCode()}
        runCodeFunction={rungeqDemo}
      />
      <LiveCodeDemo
        title="geqUnit"
        subtitle="Check if the value is greater than or equal to another value with parameters - unit, other"
        code={getCode2()}
        runCodeFunction={runmgeqUnitDemo}
      />
      <LiveCodeDemo
        title="leq"
        subtitle="Check if the value is less than or equal to another value with parameters - other"
        code={getCode3()}
        runCodeFunction={runleqDemo}
      />
      <LiveCodeDemo
        title="leqUnit"
        subtitle="Check if the specific unit of value is less than or equal to that unit of another value with parameters - unit, other"
        code={getCode4()}
        runCodeFunction={runleqUnitDemo}
      />
      <LiveCodeDemo
        title="isEmpty"
        subtitle="Check if the value is empty"
        code={getCode5()}
        runCodeFunction={runisEmptyDemo}
      />
    </>
  );
}

function getCode() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue({ 
    lovelace: 20n, 
    c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64: 10n });
  const target = new MeshValue({ 
    lovelace: 10n, 
    c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64: 5n });
  return value.geq(target);
  `;
}

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

function getCode2() {
  return `
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
  `;
}

async function runmgeqUnitDemo() {
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

function getCode3() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue({ lovelace: 20n, "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64": 10n });
  const target = new MeshValue({ lovelace: 30n, "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64": 15n });
  return value.leq(target);
  `;
}

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

function getCode4() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue();
  value.value = { lovelace: 20n, [mockUnit]: 10n };
  value.negateAssets([
    { unit: "lovelace", quantity: "5" },
    { unit: mockUnit, quantity: "3" },
    ]);
  return value.value;
  `;
}

async function runleqUnitDemo() {
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

function getCode5() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue();
  return value.isEmpty();
  `;
}

async function runisEmptyDemo() {
  const value = new MeshValue();
  return value.isEmpty();
}
