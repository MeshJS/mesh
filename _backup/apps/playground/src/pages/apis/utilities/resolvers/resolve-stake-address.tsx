import { useState } from "react";

import { resolveRewardAddress } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAddresses } from "~/data/cardano";

export default function ResolveRewardAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveRewardAddress"
      title="Resolve Stake Address"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Provide a wallet address, and <code>resolveRewardAddress</code> will
        return a staking address in bech32 format.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(
    demoAddresses.testnetPayment,
  );

  async function runDemo() {
    const rewardAddress = resolveRewardAddress(userInput);
    return rewardAddress;
  }

  let codeSnippet = `resolveRewardAddress('${userInput}');`;

  return (
    <LiveCodeDemo
      title="Resolve Stake Address"
      subtitle="Convert wallet address to staking address"
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
