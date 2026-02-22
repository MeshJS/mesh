import { useState } from "react";

import { resolvePaymentKeyHash } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAddresses } from "~/data/cardano";

export default function ResolvePaymentKeyHash() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolvePaymentKeyHash"
      title="Resolve Payment Key Hash"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Provide an address, and <code>resolvePaymentKeyHash</code> will return
        the pub key hash of the payment key. This key hash is useful for
        building the NativeScript.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(demoAddresses.testnet);

  async function runDemo() {
    const hash = resolvePaymentKeyHash(userInput);
    return hash;
  }

  let codeSnippet = `resolvePaymentKeyHash('${userInput}')`;

  return (
    <LiveCodeDemo
      title="Resolve Payment Key Hash"
      subtitle="Convert address to pub key hash"
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
