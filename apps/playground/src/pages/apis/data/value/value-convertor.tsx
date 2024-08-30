import {
  Asset,
  byteString,
  dict,
  Dict,
  Integer,
  integer,
  Value,
  value,
} from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function ValueConvertor() {
  return (
    <TwoColumnsScroll
      sidebarTo="ValueConvertor"
      title="Convertor - converts assets into Cardano data Value in JSON"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>value</code> converts assets into Cardano data Value in JSON with
        parameters:
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
  async function runvalueDemo() {
    const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
    const datum: Value = value(val);
    const nameMap = dict<Integer>([[byteString(""), integer(1000000)]]);
    const valMap = dict<Dict<Integer>>([[byteString(""), nameMap]]);
    if (JSON.stringify(datum) === JSON.stringify(valMap)) {
      return true;
    }
  }

  let code = `
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const datum: Value = value(val);
  const nameMap = dict<Integer>([[byteString(""), integer(1000000)]]);
  const valMap = dict<Dict<Integer>>([[byteString(""), nameMap]]);
  if (JSON.stringify(datum) === JSON.stringify(valMap)) {
  return true; 
  `;

  return (
    <>
      <LiveCodeDemo
        title="value"
        subtitle="Converts assets into MeshValue with parameters - asset[] e.g. ada value, simple token token, complex value."
        code={code}
        runCodeFunction={runvalueDemo}
      />
    </>
  );
}
