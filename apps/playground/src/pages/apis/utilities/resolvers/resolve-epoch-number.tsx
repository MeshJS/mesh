import { useState } from "react";

import { resolveEpochNo } from "@meshsdk/core";

import Select from "~/components/form/select";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ResolveEpochNumber() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveEpochNumber"
      title="Resolve Epoch Number"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = `import { resolveEpochNo } from '@meshsdk/core';\n`;

  let code2 = `${code1}const epoch = resolveEpochNo('preprod');`;

  let code3 = `${code1}`;
  code3 += `let oneYearFromNow = new Date();\n`;
  code3 += `oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);\n`;
  code3 += `const epoch = resolveEpochNo('preprod', oneYearFromNow.getTime());`;

  return (
    <>
      <p>
        With <code>resolveEpochNo</code>, you can get the current epoch with:
      </p>
      <Codeblock data={code2} />
      <p>
        You can also provide date in <code>milliseconds</code> to get epoch in
        the past or the future. For example, get the epoch 1 year from now:
      </p>
      <Codeblock data={code3} />
    </>
  );
}

function Right() {
  return (
    <>
      <Right1 />
      <Right2 />
    </>
  );
}

function Right1() {
  const [userInput, setUserInput] = useState<
    "preprod" | "testnet" | "preview" | "mainnet"
  >("preprod");

  async function runDemo() {
    return resolveEpochNo(userInput);
  }

  let codeSnippet = `resolveEpochNo('${userInput}');`;

  return (
    <LiveCodeDemo
      title="Resolve Epoch number"
      subtitle="Get the epoch number for the network"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Select
            id="chooseNetwork"
            options={{
              preprod: "preprod",
              testnet: "testnet",
              preview: "preview",
              mainnet: "mainnet",
            }}
            value={userInput}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setUserInput(
                e.target.value as "preprod" | "testnet" | "preview" | "mainnet",
              )
            }
            label="Select network"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}

function Right2() {
  const [userInput, setUserInput] = useState<
    "preprod" | "testnet" | "preview" | "mainnet"
  >("preprod");

  async function runDemo() {
    let oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    return resolveEpochNo(userInput, oneYearFromNow.getTime());
  }

  let codeSnippet = ``;
  codeSnippet += `let oneYearFromNow = new Date()\n`;
  codeSnippet += `oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);\n`;
  codeSnippet += `resolveEpochNo(userInput, oneYearFromNow.getTime());\n`;

  return (
    <LiveCodeDemo
      title="Resolve Epoch number 1 year from now"
      subtitle="Get the epoch number for the network 1 year from now"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Select
            id="chooseNetwork"
            options={{
              preprod: "preprod",
              testnet: "testnet",
              preview: "preview",
              mainnet: "mainnet",
            }}
            value={userInput}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setUserInput(
                e.target.value as "preprod" | "testnet" | "preview" | "mainnet",
              )
            }
            label="Select network"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
