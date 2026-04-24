import { Asset, MValue, mValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function MvalueConvertor() {
  return (
    <TwoColumnsScroll
      sidebarTo="MvalueConvertor"
      title="Convertor - converts assets into Cardano data Value in Mesh Data type"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>mValue</code> converts assets into Cardano data value in Mesh Data
        type with parameters:
      </p>
      <ul>
        <li>
          <b>assets</b> - Asset[] to convert
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function runmvalueDemo() {
    const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
    const datum: MValue = mValue(val);
    const nameMap = new Map().set("", 1000000);
    const valMap = new Map().set("", nameMap);
    if (JSON.stringify(datum) === JSON.stringify(valMap)) {
      return true;
    }
  }

  let code = `
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const datum: MValue = mValue(val); 
  const nameMap = new Map().set("", 1000000);
  const valMap = new Map().set("", nameMap);
  if (JSON.stringify(datum) === JSON.stringify(valMap)) {
  return true;
    `;

  return (
    <>
      <LiveCodeDemo
        title="mValue"
        subtitle="Converts assets into MeshValue with parameters - asset[] e.g. ada value, simple token token, complex value."
        code={code}
        runCodeFunction={runmvalueDemo}
      />
    </>
  );
}
