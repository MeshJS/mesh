import { MeshMarketplaceContract } from "@meshsdk/contract";
import { mPubKeyAddress, SpendingBlueprint } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPubKeyHash, demoStakeCredential } from "~/data/cardano";
import { compiledCode } from "~/pages/aiken/common";

const demoCompiledCode = MeshMarketplaceContract.getCompiledCode();
const stakeHash = "9e8a6e5fcbbb5b84deefc71d7cb6319a3da9cc3d19765efb303647ef";

export default function SpendingBlueprintUtil() {
  return (
    <TwoColumnsScroll
      sidebarTo="spendingScriptBlueprint"
      title="Spending Script Blueprint"
      leftSection={left()}
      rightSection={right()}
    />
  );
}

function left() {
  return (
    <>
      <p>
        <code>SpendingBlueprint</code> is a class for handling spending
        blueprint particularly. You can provide <code>plutusVersion</code>,{" "}
        <code>networkId</code> and the potential <code>stakeKeyHash</code> for
        the spending validator address to initialized the class. After that,
        providing the <code>compiledCode</code> and parameters to finish the
        setup. The class then provide easy access to common script information:
      </p>
      <ul>
        <li>Script Hash</li>
        <li>Script Cbor</li>
        <li>Script Address</li>
      </ul>
      <p>
        A Spending validator with no parameter, allows to provides only the
        <code>compiledCode</code> instead.
      </p>
    </>
  );
}
function right() {
  return (
    <>
      <BlueprintApplyParamDemo />
      <BlueprintNoParamDemo />
    </>
  );
}

function BlueprintApplyParamDemo() {
  async function runDemo() {
    const bluePrint = new SpendingBlueprint("V2", 0, stakeHash);
    bluePrint.paramScript(
      compiledCode,
      [mPubKeyAddress(demoPubKeyHash, demoStakeCredential), 100],
      "Mesh",
    );
    const scriptHash = bluePrint.hash;
    const scriptCbor = bluePrint.cbor;
    const scriptAddress = bluePrint.address;

    return { scriptHash, scriptCbor, scriptAddress };
  }

  let codeSnippet = ``;
  codeSnippet += `import { SpendingBlueprint } from "@meshsdk/core";\n`;
  codeSnippet += `\n`;
  codeSnippet += `const demoCompiledCode = "${demoCompiledCode}";\n`;
  codeSnippet += `// provide your staking part for the compiled address\n`;
  codeSnippet += `const stakeHash = "9e8a6e5fcbbb5b84deefc71d7cb6319a3da9cc3d19765efb303647ef";\n`;
  codeSnippet += `\n`;
  codeSnippet += `const blueprint =  new SpendingBlueprint("V2", 0, stakeHash);\n`;
  codeSnippet += `blueprint.paramScript(\n`;
  codeSnippet += `  demoCompiledCode,\n`;
  codeSnippet += `  mPubKeyAddress("${demoPubKeyHash}", "${demoStakeCredential}")],\n`;
  codeSnippet += `  "Mesh" // Mesh data type \n `;
  codeSnippet += `);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const scriptHash = blueprint.hash;\n`;
  codeSnippet += `const scriptCbor = blueprint.cbor;\n`;
  codeSnippet += `const scriptAddress = blueprint.address;\n`;

  return (
    <LiveCodeDemo
      title="Spending Script Blueprint - Apply parameter to script "
      subtitle="Creates a spending script blueprint with apply parameter to script."
      code={codeSnippet}
      runCodeFunction={runDemo}
    ></LiveCodeDemo>
  );
}

function BlueprintNoParamDemo() {
  async function runDemo() {
    const bluePrint = new SpendingBlueprint("V2", 0, stakeHash);
    bluePrint.noParamScript(demoCompiledCode);

    const scriptHash = bluePrint.hash;
    const scriptCbor = bluePrint.cbor;
    const scriptAddress = bluePrint.address;

    return { scriptHash, scriptCbor, scriptAddress };
  }

  let codeSnippet = ``;
  codeSnippet += `const blueprint = new SpendingBlueprint("V2", 0 , stakeHash);\n`;
  codeSnippet += `blueprint.noParamScript(demoCompiledCode);\n\n`;
  codeSnippet += `const scriptHash = blueprint.hash;\n`;
  codeSnippet += `const scriptCbor = blueprint.cbor;\n`;
  codeSnippet += `const scriptAddress = bluePrint.address;\n`;
  codeSnippet += `;\n`;

  return (
    <LiveCodeDemo
      title="Spending Script blueprint - no parameter to script"
      subtitle="Creates a spending script blueprint with no parameter to script."
      runCodeFunction={runDemo}
      code={codeSnippet}
    ></LiveCodeDemo>
  );
}
