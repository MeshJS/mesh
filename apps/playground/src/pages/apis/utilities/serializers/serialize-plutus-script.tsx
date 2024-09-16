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
      <p>Serialize Plutus script into bech32 address.</p>
    </>
  );
}

function Right() {
  async function runDemo() {
    const script: PlutusScript = {
      code: demoPlutusAlwaysSucceedScript,
      version: "V2",
    };

    const address = serializePlutusScript(script);

    return address;
  }

  let codeSnippet = ``;
  codeSnippet += `const script: PlutusScript = {\n`;
  codeSnippet += `  code: demoPlutusAlwaysSucceedScript,\n`;
  codeSnippet += `  version: "V2",\n`;
  codeSnippet += `};\n\n`;
  codeSnippet += `serializePlutusScript(script);\n\n`;

  return (
    <LiveCodeDemo
      title="Serialize Plutus Script"
      subtitle="Serialize Plutus script into bech32 address"
      code={codeSnippet}
      runCodeFunction={runDemo}
    ></LiveCodeDemo>
  );
}
