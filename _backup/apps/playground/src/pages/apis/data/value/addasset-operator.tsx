import { Asset, MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function AddAssetOperator() {
  return (
    <TwoColumnsScroll
      sidebarTo="AddAssetOperator"
      title="Operator - add an asset to the Value class's value record with parameters - asset"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>addAsset</code> Add an asset to the Value class's value record
        with parameters:
      </p>
      <ul>
        <b>asset</b> - Asset to add
      </ul>
    </>
  );
}

function Right() {
  async function runAddAssetDemo() {
    const value = new MeshValue();
    const singleAsset: Asset = {
      unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
      quantity: "100",
    };
    value.addAsset(singleAsset);
    return value.value;
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue();
  const singleAsset: Asset = { unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234", quantity: "100" };
  value.addAsset(singleAsset);
  return value.value;
    `;

  return (
    <>
      <LiveCodeDemo
        title="addAsset"
        subtitle="Add an asset to the Value class's value record with parameters - asset"
        code={code}
        runCodeFunction={runAddAssetDemo}
      />
    </>
  );
}
