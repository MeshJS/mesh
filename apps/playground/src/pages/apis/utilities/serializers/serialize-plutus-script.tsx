import { PlutusScript, serializePlutusScript } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPlutusAlwaysSucceedScript } from "~/data/cardano";

export default function SerializePlutusScript() {
  return (
    <TwoColumnsScroll
      sidebarTo="serializePlutusScript"
      title="Serialize Plutus Script"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>The function <code>serializePlutusScript</code> allows you to provide the <code>plutusScript</code>{" "}
         with an option of <code>networkId</code> and <code>stakeCredentialHash</code>,  {" "}
         returns:
         <ul>
      <li>
        Bech32 address
      </li>
      </ul>
      This example demonstrates how to derive and serialize a plutus script into a bech32 address.
      </p>
    </>
  );
}

function Right() {
  async function runDemo() {
    const plutusScript: PlutusScript = {
      code: demoPlutusAlwaysSucceedScript,
      version: "V2",
    };

    const address = serializePlutusScript(plutusScript);

    return address;
  }

  let codeSnippet = ``;
  codeSnippet += `import { PlutusScript, serializePlutusScript } from "@meshsdk/core";\n\n`;
  codeSnippet += `const plutusScript: PlutusScript = {\n`;
  codeSnippet += `  code: demoPlutusAlwaysSucceedScript,\n`;
  codeSnippet += `  version: "V2",\n`;
  codeSnippet += `};\n\n`;
  codeSnippet += `serializePlutusScript(plutusScript);\n\n`;

  return (
    <LiveCodeDemo
      title="Serialize Plutus Script"
      subtitle="Serialize Plutus script into bech32 address"
      code={codeSnippet}
      runCodeFunction={runDemo}
    ></LiveCodeDemo>
  );
}
