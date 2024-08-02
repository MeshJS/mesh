import { useState } from "react";

import { NativeScript } from "@meshsdk/core";
import {
  resolveNativeScriptAddress,
  resolvePaymentKeyHash,
} from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAddresses } from "~/data/cardano";

export default function ResolveNativeScriptAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveNativeScriptAddress"
      title="Resolve Native Script Address"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Converts <code>NativeScript</code> into address.
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

    const address = resolveNativeScriptAddress(
      nativeScript,
      userInput.substring(0, 5) === "addr1" ? 1 : 0,
    );
    return address;
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
  codeSnippet += `const address = resolveNativeScriptAddress(\n`;
  codeSnippet += `  nativeScript,\n`;
  codeSnippet += `  userInput.substring(0, 5) === "addr1" ? 1 : 0,\n`;
  codeSnippet += `);\n`;

  return (
    <LiveCodeDemo
      title="Resolve Native Script Address"
      subtitle="Convert NativeScript to address"
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
