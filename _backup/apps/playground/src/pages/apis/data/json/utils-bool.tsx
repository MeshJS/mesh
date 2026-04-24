import { bool } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function UtilsBool() {
  return (
    <TwoColumnsScroll
      sidebarTo="UtilsBool"
      title="Utilities in Building Boolean Data in JSON"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>bool</code> build the boolean object, with parameters:
      </p>
      <ul>
        <li>
          <b>b (boolean | boolean)</b> - the boolean to be built
        </li>
      </ul>
    </>
  );
}

function Right() {
  async function runDemo() {
    const result = bool(true);
    return result;
  }

  let code = `import { bool } from "@meshsdk/core";\n`;
  code += `bool(${true});\n`;

  return (
    <>
      <LiveCodeDemo
        title="Constructor"
        subtitle="Building JSON bool object"
        code={code}
        runCodeFunction={runDemo}
      />
    </>
  );
}
