import { mConStr } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function UtilsConstructors() {
  return (
    <TwoColumnsScroll
      sidebarTo="UtilsConstructor"
      title="Utilities in Building Constructor Mesh Data"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>mConStr</code> build the constructor object in Mesh{" "}
        <code>Data</code> type, with parameters:
      </p>
      <ul>
        <li>
          <b>alternative (number)</b> - the constructor index
        </li>
        <li>
          <b>fields (any[])</b> - the constructor fields in array
        </li>
      </ul>
      <p>
        There are also some quick utilities only taking in <b>fields</b> as
        parameters for 0 - 2 indices:
      </p>
      <ul>
        <li>
          <code>mConStr0</code> - building index 0 constructor
        </li>
        <li>
          <code>mConStr1</code> - building index 1 constructor
        </li>
        <li>
          <code>mConStr2</code> - building index 2 constructor
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function runDemo() {
    const result = mConStr(0, []);
    return result;
  }

  let code = `import { mConStr } from "@meshsdk/core";\n`;
  code += `mConStr(0, []);\n`;

  return (
    <>
      <LiveCodeDemo
        title="Constructor"
        subtitle="Building Mesh constructor object"
        code={code}
        runCodeFunction={runDemo}
      />
    </>
  );
}
