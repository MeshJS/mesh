import { useState } from "react";

import { resolveFingerprint } from "@meshsdk/core";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function ResolveFingerprint() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveFingerprint"
      title="Resolve Fingerprint"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Takes policy ID and asset name, and return asset fingerprint based on{" "}
        <Link href="https://cips.cardano.org/cip/cip-14">CIP-14</Link>.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(
    "426117329844ccb3b0ba877220ff06a5bdf21eab3fb33e2f3a3f8e69",
  );
  const [userInput2, setUserInput2] = useState<string>("4d657368546f6b656e");

  async function runDemo() {
    const hash = resolveFingerprint(userInput, userInput2);
    return hash;
  }

  let codeSnippet = ``;
  codeSnippet += `resolveFingerprint(\n`;
  codeSnippet += `  '${userInput}',\n`;
  codeSnippet += `  '${userInput2}'\n`;
  codeSnippet += `)\n`;

  return (
    <LiveCodeDemo
      title="Resolve Asset Fingerprint"
      subtitle="Convert asset policy ID and asset name to asset fingerprint."
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            label="Policy ID"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            label="Asset Name"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
