import { mBool } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function UtilsPrimitives() {
  return (
    <TwoColumnsScroll
      sidebarTo="UtilsPrimitives"
      title="Utilities in Building Primitives Mesh Data"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>mBool</code> build the boolean object in , with parameters:
      </p>
      <ul>
        <li>
          <b>b (boolean | boolean)</b> - the boolean to be built
        </li>
      </ul>
      <p>
        For the rest of Cardano data primitives, they are represented by JS
        primitives:
      </p>
      <ul>
        <li>
          <b>Integer</b> - <code>number</code> and <code>bigint</code>
        </li>
        <li>
          <b>Byte string</b> - <code>string</code>
        </li>
        <li>
          <b>List</b> - JS <code>Array</code>
        </li>
        <li>
          <b>Map</b> - JS <code>Map</code>
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function runDemo() {
    const result = mBool(true);
    return result;
  }

  let code = `import { mBool } from "@meshsdk/core";\n`;
  code += `mBool(${true});\n`;

  return (
    <>
      <LiveCodeDemo
        title="Constructor"
        subtitle="Building Mesh bool object"
        code={code}
        runCodeFunction={runDemo}
      />
    </>
  );
}
