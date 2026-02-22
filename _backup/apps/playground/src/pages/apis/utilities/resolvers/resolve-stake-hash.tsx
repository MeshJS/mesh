import { useState } from "react";

import { resolveStakeKeyHash } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAddresses } from "~/data/cardano";

export default function ResolveRewardHash() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveRewardHash"
      title="Resolve Stake Key Hash"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Provide a stake address, and <code>resolveStakeKeyHash</code> will
        return the pub key hash of the stake address. This key hash is useful
        for building the NativeScript.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(
    demoAddresses.testnetStake,
  );

  async function runDemo() {
    const hash = resolveStakeKeyHash(userInput);
    return hash;
  }

  let codeSnippet = `resolveStakeKeyHash('${userInput}');`;

  return (
    <LiveCodeDemo
      title="Resolve Stake Key Hash"
      subtitle="Convert stake address to pub key hash"
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
