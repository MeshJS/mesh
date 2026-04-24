import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function NegateassetOperator() {
  return (
    <TwoColumnsScroll
      sidebarTo="NegateassetOperator"
      title="Operator - substract an asset from the Value class's value record with parameters - asset"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>negateAsset</code> Substract an asset from the Value class's value
        record with parameters:
      </p>
      <ul>
        <b>asset</b> - Asset to substract
      </ul>
    </>
  );
}

function Right() {
  async function runnegateassetDemo() {
    const value = new MeshValue();
    value.value = { lovelace: 10n };
    value.negateAsset({ unit: "lovelace", quantity: "5" });
    return value.value;
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const value = new MeshValue();
  value.value = { lovelace: 10n };
  value.negateAsset({ unit: "lovelace", quantity: "5" });
  return value.value;
  `;

  return (
    <>
      <LiveCodeDemo
        title="negateAsset"
        subtitle="Substract an asset from the Value class's value record with parameters - asset"
        code={code}
        runCodeFunction={runnegateassetDemo}
      />
    </>
  );
}
