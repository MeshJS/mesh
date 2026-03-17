import { conStr } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function UtilsConstructors() {
  return (
    <TwoColumnsScroll
      sidebarTo="UtilsConstructor"
      title="Utilities in Building Constructor Data in JSON"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>conStr</code> build the constructor object, with parameters:
      </p>
      <ul>
        <li>
          <b>constructor (number)</b> - the constructor index
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
          <code>conStr0</code> - building index 0 constructor
        </li>
        <li>
          <code>conStr1</code> - building index 1 constructor
        </li>
        <li>
          <code>conStr2</code> - building index 2 constructor
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function runDemo() {
    const result = conStr(0, []);
    return result;
  }

  let code = `import { conStr } from "@meshsdk/core";\n`;
  code += `conStr(0, []);\n`;

  return (
    <>
      <LiveCodeDemo
        title="Constructor"
        subtitle="Building JSON constructor object"
        code={code}
        runCodeFunction={runDemo}
      />
    </>
  );
}
