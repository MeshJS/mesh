import { stringToBSArray } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function DataPlutusStringPlutusArray() {
  return (
    <TwoColumnsScroll
      sidebarTo="DataPlutusStringPlutusArray"
      title="String to Plutus Builtin ByteString Array"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Converting a hex string into a BuiltinByteString Array, with max 32
        bytes on each items.
      </p>
      <p>
        <code>stringToPlutusBSArray()</code> converts a hex string into a
        BuiltinByteString Array. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>hexString (string)</b> - the hex string to be converted
        </li>
      </ul>
      <p>
        The hex string will be split into multiple BuiltinByteString items, with
        a maximum of 32 bytes on each item
      </p>
    </>
  );
}

function Right() {
  async function runDemo() {
    const testString =
      "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461";

    const result = stringToBSArray(testString);
    return result;
  }

  let code = `import { stringToPlutusBSArray } from "@meshsdk/core";\n\n`;
  code += `const testString =\n`;
  code += `  "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461";\n`;
  code += `stringToPlutusBSArray(testString);\n`;

  return (
    <LiveCodeDemo
      title="String to Plutus Builtin ByteString Array"
      subtitle="Convert a hex string into a BuiltinByteString Array"
      code={code}
      runCodeFunction={runDemo}
    />
  );
}
