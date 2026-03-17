import { Asset, MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function AddassetsOperator() {
  return (
    <TwoColumnsScroll
      sidebarTo="AddassetsOperator"
      title="Operator - add an array of assets to the Value class's value record with parameters - assets"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>addAssets</code> Add an array of assets to the Value class's value
        record with parameters:
      </p>
      <ul>
        <b>assets</b> - Asset[] to add
      </ul>
    </>
  );
}

function Right() {
  async function runaddassetsDemo() {
    const value = new MeshValue();
    const assets: Asset[] = [
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
        quantity: "100",
      },
      { unit: "lovelace", quantity: "10" },
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
        quantity: "100",
      },
      { unit: "lovelace", quantity: "10" },
    ];
    value.addAssets(assets);
    return value.value;
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue();
  const assets: Asset[] = [
      { unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234", quantity: "100" },
      { unit: "lovelace", quantity: "10" },
      { unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234", quantity: "100" },
      { unit: "lovelace", quantity: "10" },
  ];
  value.addAssets(assets);
  return value.value;
  `;

  return (
    <>
      <LiveCodeDemo
        title="addAssets"
        subtitle="Add an array of assets to the Value class's value record with parameters - assets"
        code={code}
        runCodeFunction={runaddassetsDemo}
      />
    </>
  );
}
