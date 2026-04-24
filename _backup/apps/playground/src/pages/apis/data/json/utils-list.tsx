import { bool, byteString, integer, list } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function UtilsList() {
  return (
    <TwoColumnsScroll
      sidebarTo="UtilsList"
      title="Utilities in Building List Data in JSON"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>list</code> build the list object, with parameters:
      </p>
      <ul>
        <li>
          <b>pList (T[])</b> - the list with items to be built. The items in the
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
    const result = list([
      byteString(
        "a0bd47e8938e7c41d4c1d7c22033892319d28f86fdace791d45c51946553791b",
      ),
      integer(1000000),
      bool(false),
    ]);
    return result;
  }

  let code = `import { bool, byteString, integer, list } from "@meshsdk/core";\n`;
  code += `list([\n`;
  code += `  byteString(\n`;
  code += `    "a0bd47e8938e7c41d4c1d7c22033892319d28f86fdace791d45c51946553791b"\n`;
  code += `  ),\n`;
  code += `  integer(1000000),\n`;
  code += `  bool(false),\n`;
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
