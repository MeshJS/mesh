import { useState } from "react";

import { PlutusScript, resolvePlutusScriptAddress } from "@meshsdk/core";

import Input from "~/components/form/input";
import Select from "~/components/form/select";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPlutusAlwaysSucceedScript } from "~/data/cardano";

export default function ResolvePlutusScriptAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolvePlutusScriptAddress"
      title="Resolve Plutus Script Address"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Provide the Plutus script in CBOR, and{" "}
        <code>resolvePlutusScriptAddress</code> will return a bech32 address of
        the script.
      </p>
      <p>
        For example, we can get the address of the <code>always succeed</code>{" "}
        smart contract.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(
    demoPlutusAlwaysSucceedScript,
  );
  const [userInput2, setUserInput2] = useState<number>(0);
  const [userInput3, setUserInput3] = useState<"V1" | "V2" | "V3">("V2");

  async function runDemo() {
    const script: PlutusScript = {
      code: userInput,
      version: userInput3,
    };
    const address = resolvePlutusScriptAddress(script, userInput2);
    return address;
  }

  let codeSnippet = ``;
  codeSnippet += `const script: PlutusScript = {\n`;
  codeSnippet += `  code: '${userInput}',\n`;
  codeSnippet += `  version: "${userInput3}",\n`;
  codeSnippet += `};\n`;
  codeSnippet += `const address = resolvePlutusScriptAddress(script, ${userInput2});\n`;

  return (
    <LiveCodeDemo
      title="Resolve Plutus Script Address"
      subtitle="Convert Plutus script to address"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            label="Plutus script CBOR"
            key={0}
          />,
          <Select
            id="chooseNetwork"
            options={{
              0: "Preprod / Testnet / Preview (network: 0)",
              1: "Mainnet (network: 1)",
            }}
            value={userInput2}
            onChange={(e) => setUserInput2(parseInt(e.target.value))}
            label="Select network"
            key={1}
          />,
          <Select
            id="chooseVersion"
            options={{
              V3: "V3",
              V2: "V2",
              V1: "V1",
            }}
            value={userInput3}
            onChange={(e) =>
              setUserInput3(e.target.value as "V1" | "V2" | "V3")
            }
            label="Plutus script version"
            key={2}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
