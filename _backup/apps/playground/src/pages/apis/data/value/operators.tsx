import { Asset, MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { mockUnit } from "./";

export default function ValueOperator() {
  return (
    <TwoColumnsScroll
      sidebarTo="ValueOperator"
      title="Value Methods for Operating Mesh Data"
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
        <code>addAsset</code> Add an asset to the Value class's value record
        with parameters:
      </p>
      <ul>
        <li>
          <b>asset</b> - Asset to add
        </li>
      </ul>
    </>
  );
}

function Section2() {
  return (
    <>
      <p>
        <code>addAssets</code> Add an array of assets to the Value class's value
        record with parameters:
      </p>
      <ul>
        <li>
          <b>assets</b> - Asset[] to add
        </li>
      </ul>
    </>
  );
}

function Section3() {
  return (
    <>
      <p>
        <code>negateAsset</code> Substract an asset from the Value class's value
        record with parameters:
      </p>
      <ul>
        <li>
          <b>asset</b> - Asset to substract
        </li>
      </ul>
    </>
  );
}

function Section4() {
  return (
    <>
      <p>
        <code>negateAssets</code> Substract an array of assets from the Value
        class's value record with parameters:
      </p>
      <ul>
        <li>
          <b>assets</b> - Asset[] to substract
        </li>
      </ul>
    </>
  );
}

function Section5() {
  return (
    <>
      <p>
        <code>merge</code> Merge the given values
      </p>
      <ul>
        <li>
          <b>values</b> - MeshValue to merge
        </li>
      </ul>
    </>
  );
}

function Right() {
  return (
    <>
      <LiveCodeDemo
        title="addAsset"
        subtitle="Add an asset to the Value class's value record with parameters - asset"
        code={getCode()}
        runCodeFunction={runaddAssetDemo}
      />
      <LiveCodeDemo
        title="addAssets"
        subtitle="Add an array of assets to the Value class's value record with parameters - assets"
        code={getCode2()}
        runCodeFunction={runmaddAssetsDemo}
      />
      <LiveCodeDemo
        title="negateAsset"
        subtitle="Substract an asset from the Value class's value record with parameters - asset"
        code={getCode3()}
        runCodeFunction={runnegateAssetDemo}
      />
      <LiveCodeDemo
        title="negateAssets"
        subtitle="Substract an array of assets from the Value class's value record with parameters - assets"
        code={getCode4()}
        runCodeFunction={runtonegateAssetsDemo}
      />
      <LiveCodeDemo
        title="merge"
        subtitle="Merge the given values with parameters - values"
        code={getCode5()}
        runCodeFunction={runmergeDemo}
      />
    </>
  );
}

function getCode() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue();
  const singleAsset: Asset = { unit: mockUnit, quantity: "100" };
  value.addAsset(singleAsset);
  return value.value;
  `;
}

async function runaddAssetDemo() {
  const value = new MeshValue();
  const singleAsset: Asset = { unit: mockUnit, quantity: "100" };
  value.addAsset(singleAsset);
  return value.value;
}

function getCode2() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue();
  const assets: Asset[] = [
    { unit: mockUnit, quantity: "100" },
    { unit: "lovelace", quantity: "10" },
    { unit: mockUnit, quantity: "100" },
    { unit: "lovelace", quantity: "10" },
  ];
  value.addAssets(assets);
  return value.value;
  `;
}

async function runmaddAssetsDemo() {
  const value = new MeshValue();
  const assets: Asset[] = [
    { unit: mockUnit, quantity: "100" },
    { unit: "lovelace", quantity: "10" },
    { unit: mockUnit, quantity: "100" },
    { unit: "lovelace", quantity: "10" },
  ];
  value.addAssets(assets);
  return value.value;
}

function getCode3() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue();
  value.value = { lovelace: 10n };
  value.negateAsset({ unit: "lovelace", quantity: "5" });
  return value.value;
  `;
}

async function runnegateAssetDemo() {
  const value = new MeshValue();
  value.value = { lovelace: 10n };
  value.negateAsset({ unit: "lovelace", quantity: "5" });
  return value.value;
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

async function runtonegateAssetsDemo() {
  const value = new MeshValue();
  value.value = { lovelace: 20n, [mockUnit]: 10n };
  value.negateAssets([
    { unit: "lovelace", quantity: "5" },
    { unit: mockUnit, quantity: "3" },
  ]);
  return value.value;
}

function getCode5() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const value1 = new MeshValue();
  value1.value = { lovelace: 20n, [mockUnit]: 10n };
  const value2 = new MeshValue();
  value2.value = { lovelace: 10n, [mockUnit]: 5n };
  return value1.merge(value2).value;
  `;
}

async function runmergeDemo() {
  const value1 = new MeshValue();
  value1.value = { lovelace: 20n, [mockUnit]: 10n };
  const value2 = new MeshValue();
  value2.value = { lovelace: 10n, [mockUnit]: 5n };
  return value1.merge(value2).value;
}
