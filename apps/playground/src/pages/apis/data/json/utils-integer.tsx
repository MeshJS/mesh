import { useState } from "react";

import { integer } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function UtilsInteger() {
  return (
    <TwoColumnsScroll
      sidebarTo="UtilsInteger"
      title="Utilities in Building Integer Data in JSON"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>integer</code> build the integer object, with parameters:
      </p>
      <ul>
        <li>
          <b>int (number | bigint)</b> - the integer to be built
        </li>
      </ul>
      <p>
        This utility is compatible for both number and bigint type, which allow
        big integer exceeding the JS precision limit.
      </p>
      <h4>Aliases</h4>
      <ul>
        <li>
          <code>posixTime</code> - for the same functionality.
        </li>
      </ul>
    </>
  );
}

function Right() {
  const [value, setValue] = useState<number>(1000000);

  async function runDemo() {
    const result = integer(value);
    return result;
  }

  let code = `import { integer } from "@meshsdk/core";\n`;
  code += `integer(${value});\n`;

  return (
    <>
      <LiveCodeDemo
        title="Constructor"
        subtitle="Building JSON integer object"
        code={code}
        runCodeFunction={runDemo}
      >
        <InputTable
          listInputs={[
            <Input
              onChange={(e) => {
                try {
                  setValue(Number(e.target.value));
                } catch {
                  setValue(0);
                }
              }}
              label="int"
              key={0}
              value={value}
            />,
          ]}
        />
      </LiveCodeDemo>
    </>
  );
}
