import { BuiltinByteString, List, plutusBSArrayToString } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function DataPlutusPlutusArrayString() {
  return (
    <TwoColumnsScroll
      sidebarTo="DataPlutusPlutusArrayString"
      title="Plutus Builtin ByteString Array to String"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Converting BuiltinByteString Array into a hex string.</p>
      <p>
        <code>plutusBSArrayToString()</code> converts a BuiltinByteString Array
        into a hex string. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>bsArray (List BuiltinByteString)</b> - the BuiltinByteString Array
        </li>
      </ul>
      <p>
        The BuiltinByteString Array will be joined into a single hex string.
      </p>
    </>
  );
}

function Right() {
  async function runDemo() {
    const testList: List<BuiltinByteString> = {
      list: [
        {
          bytes:
            "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374",
        },
        {
          bytes:
            "696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbd",
        },
        {
          bytes:
            "d3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b19",
        },
        {
          bytes:
            "1be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e6577",
        },
        {
          bytes: "77616c2e616461",
        },
      ],
    };

    const result = plutusBSArrayToString(testList);
    return result;
  }

  let code = `import { BuiltinByteString, List, plutusBSArrayToString } from "@meshsdk/core";\n\n`;
  code += `const testList: List<BuiltinByteString> = {\n`;
  code += `  list: [\n`;
  code += `    {\n`;
  code += `      bytes:\n`;
  code += `        "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374",\n`;
  code += `    },\n`;
  code += `    {\n`;
  code += `      bytes:\n`;
  code += `        "696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbd",\n`;
  code += `    },\n`;
  code += `    {\n`;
  code += `      bytes:\n`;
  code += `        "d3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b19",\n`;
  code += `    },\n`;
  code += `    {\n`;
  code += `      bytes:\n`;
  code += `        "1be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e6577",\n`;
  code += `    },\n`;
  code += `    {\n`;
  code += `      bytes: "77616c2e616461",\n`;
  code += `    },\n`;
  code += `  ],\n`;
  code += `};\n`;
  code += `\n`;
  code += `plutusBSArrayToString(testList);\n`;

  return (
    <LiveCodeDemo
      title="Plutus Builtin ByteString Array to String"
      subtitle="Convert a BuiltinByteString Array to hex string"
      code={code}
      runCodeFunction={runDemo}
    />
  );
}
