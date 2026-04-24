import { MeshValue } from "@meshsdk/common";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function NegateassetsOperator() {
  return (
    <TwoColumnsScroll
      sidebarTo="NegateassetsOperator"
      title="Operator - substract an array of assets from the Value class's value record with parameters - assets"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>negateAssets</code> Substract an array of assets from the Value
        class's value record with parameters:
      </p>
      <ul>
        <b>assets</b> - Asset[] to substract
      </ul>
    </>
  );
}

function Right() {
  async function runnegateassetsDemo() {
    const value = new MeshValue();
    value.value = {
      lovelace: 20n,
      baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234: 10n,
    };
    value.negateAssets([
      { unit: "lovelace", quantity: "5" },
      {
        unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
        quantity: "3",
      },
    ]);
    return value.value;
  }

  let code = `
  const value = new MeshValue();
  value.value = { lovelace: 20n, "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234": 10n };
  value.negateAssets([
      { unit: "lovelace", quantity: "5" },
      { unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234", quantity: "3" },
  ]);
  return value.value;
  `;

  return (
    <>
      <LiveCodeDemo
        title="negateAssets"
        subtitle="Substract an array of assets from the Value class's value record with parameters - assets"
        code={code}
        runCodeFunction={runnegateassetsDemo}
      />
    </>
  );
}
