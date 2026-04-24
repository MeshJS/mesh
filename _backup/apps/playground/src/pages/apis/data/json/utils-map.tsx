import { assocMap, byteString, integer } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function UtilsMap() {
  return (
    <TwoColumnsScroll
      sidebarTo="UtilsMap"
      title="Utilities in Building Map Data in JSON"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>assocMap</code> build the (associative) map object, with
        parameters:
      </p>
      <ul>
        <li>
          <b>mapItems - ([KeyType, ValueType][])</b> - the array of map item in
          JS tuple format (array of array).
        </li>
        <li>
          <b>optional - validation (boolean)</b> - indicate if the current data
          construction should perform basic validation of whether it is of type
          <b>object</b> (where all JSON data is in type of <b>object</b>)
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function runDemo() {
    const result = assocMap([
      [byteString("aa"), integer(1000000)],
      [byteString("bb"), integer(2000000)],
    ]);
    return result;
  }

  let code = `import { assocMap, byteString, integer } from "@meshsdk/core";\n`;
  code += `assocMap([\n`;
  code += `  [byteString("aa"), integer(1000000)],\n`;
  code += `  [byteString("bb"), integer(2000000)],\n`;
  code += `]);\n`;

  return (
    <>
      <LiveCodeDemo
        title="Constructor"
        subtitle="Building JSON list object"
        code={code}
        runCodeFunction={runDemo}
      />
    </>
  );
}
