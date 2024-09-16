import { useState } from "react";

import { NativeScript } from "@meshsdk/core";
import {
  resolveNativeScriptHash,
  resolvePaymentKeyHash,
} from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAddresses } from "~/data/cardano";

export default function ResolveNativeScriptHash() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveNativeScriptHash"
      title="Resolve Native Script Hash"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Converts <code>NativeScript</code> into hash.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(demoAddresses.testnet);

  async function runDemo() {
    const keyHash = resolvePaymentKeyHash(userInput);

    const nativeScript: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "sig",
          keyHash: keyHash,
        },
      ],
    };

    const hash = resolveNativeScriptHash(nativeScript);
    return hash;
  }

  let codeSnippet = ``;
  codeSnippet += `const keyHash = resolvePaymentKeyHash('${userInput}');\n`;
  codeSnippet += `\n`;
  codeSnippet += `const nativeScript: NativeScript = {\n`;
  codeSnippet += `  type: "all",\n`;
  codeSnippet += `  scripts: [\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      type: "sig",\n`;
  codeSnippet += `      keyHash: keyHash,\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `  ],\n`;
  codeSnippet += `};\n`;
  codeSnippet += `\n`;
  codeSnippet += `resolveNativeScriptHash(nativeScript);`;

  return (
    <LiveCodeDemo
      title="Resolve Native Script Hash"
      subtitle="Convert NativeScript to hash"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            label="Address"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
