
import { MintingBlueprint, mPubKeyAddress } from "@meshsdk/core";
import { MeshMarketplaceContract } from "@meshsdk/contract";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPlutusMintingScript,
         demoPubKeyHash,
         demoStakeCredential
} from "~/data/cardano";


const demoCompiledCode = MeshMarketplaceContract.getCompiledCode();

export default function MintingBluePrint(){
   return (
    <TwoColumnsScroll
       sidebarTo="MintingScriptBlueprint"
       title="Minting Script Blueprint"
       leftSection={Left()}
       rightSection={Right()}
       />
   );
}

function Left(){
    return(
        <>
          <p>
         Minting Script Blueprint object returns policyId and Script Cbor.</p>
        </>
    );
};



function Right(){
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
  codeSnippet += `import { MintingBlueprint } from "@meshsdk/core;"\n\n `
  codeSnippet += ` const bluePrint = new MintingBluePrint("V2");\n`;
  codeSnippet += `      blueprint.paramScript('<compiled_script_here>'\n`;
  codeSnippet += `      [mPubKeyAddress('${demoPubKeyHash}' , '${demoStakeCredential}'), 100],\n`;
  codeSnippet += `      "Mesh" //Mesh data type \n`;
  codeSnippet += `);\n\n`;
  codeSnippet += `  const policyId = bluePrint.hash;\n`
  codeSnippet += `  const scriptCbor = bluePrint.cbor\n`

return (
  <LiveCodeDemo
     title="Minting Script Blueprint - Apply parameter to script"
     subtitle="Creates a Minting script blueprint with apply parameter to script."
     runCodeFunction={runDemo}
     code={codeSnippet}
   ></LiveCodeDemo>
 );
}

function BlueprintNoParamDemo(){
    async function runDemo(){
        const bluePrint = new MintingBlueprint("V2");
        bluePrint.noParamScript(demoCompiledCode);
        
       const policyId   =   bluePrint.hash;
       const scriptCbor =   bluePrint.cbor;
    return  {policyId,scriptCbor};
    };

    let codeSnippet = ``
    codeSnippet += `const bluePrint = new MintingBlueprint("V2");\n`
    codeSnippet += `   bluePrint.noParamScript(demoCompiledCode);\n\n`
    codeSnippet += ` const policyId = bluePrint.hash\n`
    codeSnippet += ` const scriptCbor = bluePrint.cbor\n\n`

    return (
        <LiveCodeDemo
        title="Minting Script blueprint - no parameter to script"
        subtitle="Creates a Minting script blueprint with no parameter to script."
        runCodeFunction={runDemo}
        code={codeSnippet}
        ></LiveCodeDemo>
    );
};
