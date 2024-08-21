import { useState } from "react";

import { deserializeAddress } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAddresses } from "~/data/cardano";

export default function DeserializeAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="deserializeAddress"
      title="Deserialize Address"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Deserialize bech32 address into payment and staking parts, with
        visibility of whether they are script or key hash.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(
    demoAddresses.testnetPayment,
  );

  async function runDemo() {
    return deserializeAddress(userInput);
  }

  let codeSnippet = `deserializeAddress('${userInput}');`;

  return (
    <LiveCodeDemo
      title="Deserialize Address"
      subtitle="Convert bech32 address to The deserialized address object"
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
