import { Asset, MeshValue, Value, value } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function ToassetsConvertor() {
  return (
    <TwoColumnsScroll
      sidebarTo="ToassetsConvertor"
      title="Convertor - converts the MeshValue object into an array of Asset"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>toAssets</code> Convert the MeshValue object into an array of
        Asset
      </p>
    </>
  );
}

function Right() {
  async function runtoassetsDemo() {
    const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
    const plutusValue: Value = value(val);
    const assets: Asset[] = MeshValue.fromValue(plutusValue).toAssets();
    return assets;
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const plutusValue: Value = value(val);
  const assets: Asset[] = MeshValue.fromValue(plutusValue).toAssets();
  return assets;
  `;

  return (
    <>
      <LiveCodeDemo
        title="toAssets"
        subtitle="Converts the MeshValue object into an array of Asset"
        code={code}
        runCodeFunction={runtoassetsDemo}
      />
    </>
  );
}
