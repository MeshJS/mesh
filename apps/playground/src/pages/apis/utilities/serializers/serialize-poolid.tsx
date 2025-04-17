import { useState } from "react";

import { serializePoolId } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPubKeyHash } from "~/data/cardano";

export default function SerializePoolId() {
  return (
    <TwoColumnsScroll
      sidebarTo="serializePoolId"
      title="Serialize Pool ID"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        The function <code>serializePoolId</code> allows you to provide the <code>pubKeyHash</code>{" "}
        i.e (pool Hash), {" "}
        returns:
        <ul>
          <li>
            Pool Id
          </li>
        </ul>
        You can use this function to convert a pool hash into a pool ID, which is useful for interacting with {" "} 
        staking and delegation mechanisms.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(demoPubKeyHash);

  async function runDemo() {
    return serializePoolId(userInput);
  }

  let codeSnippet = `serializePoolId('${userInput}');`;

  return (
    <LiveCodeDemo
      title="Serialize Pool ID"
      subtitle="Resolve the pool ID from hash"
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
