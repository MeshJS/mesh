
import { MintingBlueprint, mPubKeyAddress } from "@meshsdk/core";
import { MeshMarketplaceContract } from "@meshsdk/contract";
import   LiveCodeDemo from "~/components/sections/live-code-demo";
import   TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPlutusMintingScript,
         demoPubKeyHash,
         demoStakeCredential
} from "~/data/cardano";

const demoCompiledCode = MeshMarketplaceContract.getCompiledCode();

export default function MintingBluePrint(){
   return (
    <TwoColumnsScroll
       sidebarTo="mintingScriptBlueprint"
       title="Minting Script Blueprint"
       leftSection={left()}
       rightSection={right()}
       />
   );
};

function left() {
    return (
      <>
        <p>
          <code>MintingBlueprint</code> is a class for handling Minting
          blueprint particularly. You can provide <code>plutusVersion</code>,{" "}
          for the minting validator to initialize the class. After that,
          providing the <code>compiledCode</code> and parameters to finish the
          setup. The class then provide easy access to common script information:
        </p>
        <ul>
          <li>Policy id</li>
          <li>Script Cbor</li>
        </ul>
        <br />
        <br />
        <br />
        <br />
        <br />
        <p>
             A Minting validator with no parameter, allows to provides only the 
            <code>compiledCode</code> instead.
        </p>
      </>
    );
};

function right(){
    return(
        <>
   <BlueprintApplyParamDemo />
   <BlueprintNoParamDemo />
   </>
    );
};

function BlueprintApplyParamDemo(){
    async function runDemo(){
     const blueprint = new MintingBlueprint("V2");
          blueprint.paramScript(
            demoPlutusMintingScript,
            [mPubKeyAddress(demoPubKeyHash,demoStakeCredential), 100],
            "Mesh"
        );
    const policyId =   blueprint.hash;
    const ScriptCbor = blueprint.cbor;
    return { policyId, ScriptCbor};
    };

  let codeSnippet = ``;
      codeSnippet += `const blueprint = new MintingBluePrint("V2");\n`;
      codeSnippet += `blueprint.paramScript('<compiled_script_here>',\n`;
      codeSnippet += `          [mPubKeyAddress('${demoPubKeyHash}' , '${demoStakeCredential}'), 100],\n`;
      codeSnippet += `          "Mesh" )//Mesh data type \n\n`;
      codeSnippet += `const policyId = blueprint.hash;\n`
      codeSnippet += `const scriptCbor = blueprint.cbor\n`

return (
  <LiveCodeDemo
     title="Minting Script Blueprint - Apply parameter to script"
     subtitle="Creates a Minting script blueprint with apply parameter to script."
     runCodeFunction={runDemo}
     code={codeSnippet}
   ></LiveCodeDemo>
   );
};

function BlueprintNoParamDemo(){
    async function runDemo(){
       const bluePrint = new MintingBlueprint("V2");
       bluePrint.noParamScript(demoCompiledCode);
        
       const policyId   =   bluePrint.hash;
       const scriptCbor =   bluePrint.cbor;
    return  {policyId,scriptCbor};
   };

    let codeSnippet = ``
        codeSnippet += `const blueprint = new MintingBlueprint("V2");\n`
        codeSnippet += `blueprint.noParamScript(demoCompiledCode);\n\n`
        codeSnippet += `const policyId = bluePrint.hash\n`
        codeSnippet += `const scriptCbor = bluePrint.cbor\n\n`

    return (
        <LiveCodeDemo
        title="Minting Script blueprint - no parameter to script"
        subtitle="Creates a Minting script blueprint with no parameter to script."
        runCodeFunction={runDemo}
        code={codeSnippet}
        ></LiveCodeDemo>
    );
};
