import { useState } from "react";

import { byteString } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function UtilsByteString() {
  return (
    <TwoColumnsScroll
      sidebarTo="UtilsByteString"
      title="Utilities in Building ByteString Data in JSON"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>byteString</code> build the byte string object, with parameters:
      </p>
      <ul>
        <li>
          <b>bytes (string)</b> - the byte string in hex to be built, validation
          would be performed on whether the <b>bytes</b> is a valid hex string
        </li>
      </ul>
      <h4>Aliases</h4>
      <ul>
        <li>
          <code>builtinByteString</code> - for the same functionality, for
          developers more familiar to the PlutusTx naming convention.
        </li>
        <li>
          <code>scriptHash</code> / <code>pubKeyHash</code> /{" "}
          <code>policyId</code> / <code>currencySymbol</code> /{" "}
          <code>assetName</code> / <code>tokenName</code> - same building the
          byte string JSON but with further input validation.
        </li>
      </ul>
    </>
  );
}

function Right() {
  const [value, setValue] = useState<string>(
    "a0bd47e8938e7c41d4c1d7c22033892319d28f86fdace791d45c51946553791b",
  );

  async function runDemo() {
    const result = byteString(value);
    return result;
  }

  let code = `import { byteString } from "@meshsdk/core";\n`;
  code += `byteString("${value}");\n`;

  return (
    <>
      <LiveCodeDemo
        title="Constructor"
        subtitle="Building JSON byteString object"
        code={code}
        runCodeFunction={runDemo}
      >
        <InputTable
          listInputs={[
            <Input
              onChange={(e) => {
                setValue(e.target.value);
              }}
              label="byteString"
              key={0}
              value={value}
            />,
          ]}
        />
      </LiveCodeDemo>
    </>
  );
}
