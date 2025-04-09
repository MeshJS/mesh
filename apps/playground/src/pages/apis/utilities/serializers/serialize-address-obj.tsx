
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
      <p>
      The function <code>SerializeAddressObj</code> allows you to provide the plutus data Scipt address object{" "}
      in Cardano data JSON format and option of <code>networkId</code>.
      returns:
      </p>
      <ul>
        <li>
          Bech32 address 
        </li>
      </ul>
      This example demonstrates how to derive a plutus data Scipt address with {" "}
      function <code>scriptAddress</code> then serialize with <code>SerializeAddressObj</code>{" "}
      to a bech32 address.
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
  codeSnippet += `import { scriptAddress, serializeAddressObj } from "@meshsdk/core";\n\n`;
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
