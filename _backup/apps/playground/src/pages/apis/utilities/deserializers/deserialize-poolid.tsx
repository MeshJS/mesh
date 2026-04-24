import { useState } from "react";

import { deserializePoolId } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPool } from "~/data/cardano";

export default function DeserializePoolId() {
  return (
    <TwoColumnsScroll
      sidebarTo="deserializePoolId"
      title="Deserialize Pool Id"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Deserialize a script from a pool id to Ed25519 key hash.</p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(demoPool);

  async function runDemo() {
    return deserializePoolId(userInput);
  }

  let codeSnippet = `deserializePoolId('${userInput}');`;

  return (
    <LiveCodeDemo
      title="Deserialize Pool Id"
      subtitle="Deserialize a script from a pool id to Ed25519 key hash"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            label="Pool Id"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
