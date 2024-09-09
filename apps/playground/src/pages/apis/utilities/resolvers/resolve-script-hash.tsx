import { useState } from "react";

import { resolveScriptHash } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function ResolveScriptHash() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveScriptHash"
      title="Resolve Script Hash"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>resolveScriptHash</code> will return a script hash. For example,
        this is useful when you want to convert a script to a policy ID.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(
    "8200581c5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f",
  );

  async function runDemo() {
    return resolveScriptHash(userInput);
  }

  let codeSnippet = `resolveScriptHash('${userInput}')`;

  return (
    <LiveCodeDemo
      title="Resolve Script Hash"
      subtitle="Convert script to hash (like policy ID)"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            label=" script address"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
