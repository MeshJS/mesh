import { useState } from "react";

import { resolvePlutusScriptHash } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function ResolvePlutusScriptHash() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolvePlutusScriptHash"
      title="Resolve Plutus Script Hash"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Provide the Plutus script address, and{" "}
        <code>resolvePlutusScriptHash</code> will return a script hash. This
        script hash can be use for building minting transaction with Plutus
        contract.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(
    "addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8",
  );

  async function runDemo() {
    return resolvePlutusScriptHash(userInput);
  }

  let codeSnippet = `resolvePlutusScriptHash('${userInput}')`;

  return (
    <LiveCodeDemo
      title="Resolve Plutus Script Hash"
      subtitle="Convert Plutus script to hash"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            label="Plutus script address"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
