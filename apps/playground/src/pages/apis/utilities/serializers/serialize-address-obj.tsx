import { pubKeyAddress, serializeAddressObj } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
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
  let codeSnippetPubkey = ``;
  codeSnippetPubkey += `pubKeyAddress(\n`;
  codeSnippetPubkey += `  bytes: string, \n`;
  codeSnippetPubkey += `  stakeCredential?: string, \n`;
  codeSnippetPubkey += `  isStakeScriptCredential?: boolean\n`;
  codeSnippetPubkey += `): PubKeyAddress\n`;

  let codeSnippetScript = ``;
  codeSnippetScript += `scriptAddress(\n`;
  codeSnippetScript += `  bytes: string,\n`;
  codeSnippetScript += `  stakeCredential?: string,\n`;
  codeSnippetScript += `  isStakeScriptCredential?: boolean\n`;
  codeSnippetScript += `): ScriptAddress\n`;

  let codeSnippetSerialize = ``;
  codeSnippetSerialize += `serializeAddressObj(\n`;
  codeSnippetSerialize += `  address: PubKeyAddress | ScriptAddress, \n`;
  codeSnippetSerialize += `  networkId?: number\n`;
  codeSnippetSerialize += `): string\n`;

  return (
    <>
      <p>
        Serialize address in Cardano data JSON format into bech32 address with{" "}
        <code>serializeAddressObj()</code>.
      </p>
      <p>
        First you need to create an address object with{" "}
        <code>pubKeyAddress()</code> or <code>scriptAddress()</code>.
      </p>
      <p>
        <code>pubKeyAddress()</code> accepts the following parameters:
      </p>
      <Codeblock data={codeSnippetPubkey} />

      <p>
        <code>scriptAddress()</code> accepts the following parameters:
      </p>
      <Codeblock data={codeSnippetScript} />

      <p>
        <code>serializeAddressObj()</code> accepts the following parameters:
      </p>
      <Codeblock data={codeSnippetSerialize} />
    </>
  );
}

function Right() {
  async function runDemo() {
    const address = pubKeyAddress(demoPubKeyHash, demoStakeCredential);
    return serializeAddressObj(address, 1);
  }

  let codeSnippet = `import { pubKeyAddress, serializeAddressObj } from "@meshsdk/core";\n\n`;
  codeSnippet += `const address = pubKeyAddress(\n`;
  codeSnippet += `  '${demoPubKeyHash}',\n`;
  codeSnippet += `  '${demoStakeCredential}'\n`;
  codeSnippet += `);\n\n`;
  codeSnippet += `serializeAddressObj(address, 1);`;

  return (
    <LiveCodeDemo
      title="Serialize Address Object"
      subtitle="Serialize address in Cardano data JSON format into bech32 address"
      code={codeSnippet}
      runCodeFunction={runDemo}
    ></LiveCodeDemo>
  );
}
