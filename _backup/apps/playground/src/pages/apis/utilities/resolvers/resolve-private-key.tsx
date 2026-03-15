import { useState } from "react";

import { resolvePrivateKey } from "@meshsdk/core";

import Textarea from "~/components/form/textarea";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoMnemonic } from "~/data/cardano";

export default function ResolvePrivateKey() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolvePrivateKey"
      title="Resolve Private Key"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Provide the mnemonic phrases and <code>resolvePrivateKey</code> will
        return a private key.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(
    JSON.stringify(demoMnemonic, null, 2),
  );

  async function runDemo() {
    let _mnemonic = [];
    try {
      _mnemonic = JSON.parse(userInput);
    } catch (e) {
      return "Mnemonic input is not a valid array.";
    }
    const dataHash = resolvePrivateKey(_mnemonic);
    return dataHash;
  }

  let _mnemonic = JSON.stringify(demoMnemonic);
  try {
    _mnemonic = JSON.stringify(JSON.parse(userInput));
  } catch (e) {}
  let codeSnippet = `resolvePrivateKey(${_mnemonic});`;

  return (
    <LiveCodeDemo
      title="Resolve Private Key"
      subtitle="Convert mnemonic to private key"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            label="Mnemonic"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
