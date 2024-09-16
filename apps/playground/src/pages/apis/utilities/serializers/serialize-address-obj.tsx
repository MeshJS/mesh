
import { scriptAddress, serializeAddressObj } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPubKeyHash, demoStakeCredential } from "~/data/cardano";

export default function SerializeAddressObj() {
  return (
    <TwoColumnsScroll
      sidebarTo="serializeAddressObj"
      title="Serialize Address Object"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Serialize address in Cardano data JSON format into bech32 address.</p>
    </>
  );
}

function Right() {
  async function runDemo() {
    const address = scriptAddress(
      demoPubKeyHash,
      demoStakeCredential
    );

    return serializeAddressObj(address);
  }

  let codeSnippet = ``;
  codeSnippet += `const address = scriptAddress(\n`;
  codeSnippet += `  '${demoPubKeyHash}',\n`;
  codeSnippet += `  '${demoStakeCredential}'\n`;
  codeSnippet += `);\n\n`;
  codeSnippet += `serializeAddressObj(address);`;

  return (
    <LiveCodeDemo
      title="Serialize Address Object"
      subtitle="Serialize address in Cardano data JSON format into bech32 address"
      code={codeSnippet}
      runCodeFunction={runDemo}
    ></LiveCodeDemo>
  );
}
