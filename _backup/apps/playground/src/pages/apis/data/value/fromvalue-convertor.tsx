import { Asset, MeshValue, Value, value } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function FromvalueConvertor() {
  return (
    <TwoColumnsScroll
      sidebarTo="FromvalueConvertor"
      title="Convertor - converts Value (the JSON representation of Cardano data Value) into MeshValue"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>fromValue</code> Convert Value (the JSON representation of Cardano
        data Value) into MeshValue with parameters:
      </p>
      <ul>
        <li>
          <b>plutusValue</b> - the value to convert
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function runfromvalueDemo() {
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
        title="fromValue"
        subtitle="Convert Value (the JSON representation of Cardano data Value) into MeshValue."
        code={code}
        runCodeFunction={runfromvalueDemo}
      />
    </>
  );
}
