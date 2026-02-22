import {
  Asset,
  MeshValue,
  MValue,
  mValue,
  Value,
  value,
} from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function TodataConvertor() {
  return (
    <TwoColumnsScroll
      sidebarTo="TodataConvertor"
      title="Convertor - converts the MeshValue object into Cardano data Value in Mesh Data type"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>toData</code> Convert the MashValue object into Cardano data Value
        in Mesh Data type
      </p>
    </>
  );
}

function Right() {
  async function runtodataDemo() {
    const val: Asset[] = [
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
        quantity: "100",
      },
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
        quantity: "200",
      },
    ];
    const plutusValue: Value = value(val);
    const data = MeshValue.fromValue(plutusValue).toData();
    const expected: MValue = mValue(val);
    if (JSON.stringify(expected) === JSON.stringify(data)) {
      return true;
    }
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const val: Asset[] = [
    {
      unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
      quantity: "100",
    },
    {
      unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
      quantity: "200",
    },
  ];
  const plutusValue: Value = value(val);
  const data = MeshValue.fromValue(plutusValue).toData();
  const expected: MValue = mValue(val);
  if (JSON.stringify(expected) === JSON.stringify(data)) {
    return true;
    `;

  return (
    <>
      <LiveCodeDemo
        title="toData"
        subtitle="Converts the MeshValue object into Cardano data Value in Mesh Data type"
        code={code}
        runCodeFunction={runtodataDemo}
      />
    </>
  );
}
