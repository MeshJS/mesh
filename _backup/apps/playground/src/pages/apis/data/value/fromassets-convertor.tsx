import { Asset, MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function FromassetsConvertor() {
  return (
    <TwoColumnsScroll
      sidebarTo="FromassetsConvertor"
      title="Convertor - converts assets into MeshValue with parameters - asset[]"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>fromAssets</code> converts assets into MeshValue with parameters:
      </p>
      <ul>
        <li>
          <b>assets</b> - the assets to convert
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function runfromassetsDemo() {
    const assets: Asset[] = [
      {
        unit: "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64",
        quantity: "100",
      },
      { unit: "lovelace", quantity: "10" },
    ];
    const value = MeshValue.fromAssets(assets);
    return value;
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const assets: Asset[] = [
    { unit: "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64", quantity: "100" },
    { unit: "lovelace", quantity: "10" },
  ];
  const value = MeshValue.fromAssets(assets);
  return value;
  `;

  return (
    <>
      <LiveCodeDemo
        title="fromAssets"
        subtitle="Converts assets into MeshValue with parameters - asset[] e.g. ada value, simple token token, complex value."
        code={code}
        runCodeFunction={runfromassetsDemo}
      />
    </>
  );
}
