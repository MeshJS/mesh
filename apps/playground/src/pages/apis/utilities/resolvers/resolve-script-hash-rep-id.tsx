
import { NativeScript, resolveNativeScriptHash, resolveScriptHashDRepId } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPubKeyHash } from "~/data/cardano";

export default function ResolveScriptHashDRepId() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveScriptHashDRepId"
      title="Resolve Rep Id"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Resolve Rep Id from scrip hash.
      </p>

    </>
  );
}

function Right() {

  async function runDemo() {
    let script: NativeScript = {
        type: "all",
        scripts: [
          {
            type: "sig",
            keyHash: demoPubKeyHash
          },
        ],
      };

    const dataHash = resolveScriptHashDRepId(resolveNativeScriptHash(script));
    return dataHash;
  }

  let codeSnippet = ``;
    codeSnippet += `let script: NativeScript = {\n`;    
    codeSnippet += `    type: "all",\n`;
    codeSnippet += `    scripts: [\n`;
    codeSnippet += `      {\n`;
    codeSnippet += `        type: "sig",\n`;
    codeSnippet += `        keyHash: '${demoPubKeyHash}'\n`;
    codeSnippet += `      },\n`;
    codeSnippet += `    ],\n`;
    codeSnippet += `  };\n\n`;
    codeSnippet += `resolveScriptHashDRepId(resolveNativeScriptHash(script));`;

  return (
    <LiveCodeDemo
      title="Resolve Rep Id"
      subtitle="Resolve rep id from scrip hash"
      code={codeSnippet}
      runCodeFunction={runDemo}
    ></LiveCodeDemo>
  );
}
