
import { WithdrawalBlueprint , mPubKeyAddress } from "@meshsdk/core";
import { MeshMarketplaceContract } from "@meshsdk/contract";
import   LiveCodeDemo from "~/components/sections/live-code-demo";
import   TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { 
    demoStakeCredential,
    demoPubKeyHash
} from "~/data/cardano";

const demoCompiledCode = MeshMarketplaceContract.getCompiledCode();

export default function WithdrawalBluePrint(){
    return(
        <TwoColumnsScroll
        sidebarTo="mintingScriptBlueprint"
        title="Withdrawal Script Blueprint"
        leftSection={left()}
        rightSection={right()}
    />
    );
};

function left() {
    return (
      <>
        <p>
          <code>WithdrawalBlueprint</code> is a class for handling withdrawal
          blueprint particularly. You can provide <code>plutusVersion</code>, and 
          <code>networkId</code> for the withdrawal validator to initialize the class.
          After that, providing the <code>compiledCode</code> and parameters to finish the
          setup. The class then provide easy access to common script information:
        </p>
        <ul>
          <li>Script Hash</li>
          <li>Script Cbor</li>
          <li>Reward Address</li>
        </ul>
        <br />
        <br />
        <br />
        <br />
        <br />
        <br />
        <br />
        <br />
        <p>
             A withdrawal validator with no parameter, allows to provides only the 
            <code>compiledCode</code> instead.
        </p>
      </>
    );
  };

function right(){
  return(
    <>
    <BluePrintApplyParamDemo />
    <BlueprintNoParamDemo />
    </>
  );
};

function BluePrintApplyParamDemo(){
   async function runDemo(){
        const blueprint = new WithdrawalBlueprint("V2", 0);
        blueprint.paramScript(
            demoCompiledCode,
            [mPubKeyAddress(demoPubKeyHash,demoStakeCredential), 100],
            "Mesh",
        )
        const scripthash = blueprint.hash;
        const scriptCbor = blueprint.cbor;
        const rewardAddress = blueprint.address;
        return { scripthash, scriptCbor, rewardAddress};
    };

    let code = ``;
        code += `import { WithdrawalBlueprint } from "@meshsdk/core";\n\n`;    
        code += `const blueprint = new WithdrawalBlueprint("V2", 0);\n`;
        code += `blueprint.paramScript('<compiled_Script_here>,'\n`;
        code += `      mPubKeyAddress('${demoPubKeyHash}','${demoStakeCredential}'), 100],\n`;
        code += `      "Mesh"), //Mesh Data type \n\n`;
        code += `const scripthash = blueprint.hash;\n`;
        code += `const scriptCbor = blueprint.cbor;\n`;
        code += `const rewardAddress = blueprint.address;\n`;
        code += `\n`;


    return (
        <LiveCodeDemo
          title="Withdrawal Script Blueprint - Apply parameter to script"
          subtitle="Creates a withdrawal script blueprint with apply parameter to script."
          runCodeFunction={runDemo}
          code={code}
          ></LiveCodeDemo>
    );
};

function BlueprintNoParamDemo(){
    async function runDemo(){
        const bluePrint = new WithdrawalBlueprint("V2" ,0);
              bluePrint.noParamScript(demoCompiledCode);
            
        const scriptHash   =   bluePrint.hash;
        const scriptCbor =   bluePrint.cbor;
        const rewardAddress = bluePrint.address;

        return  {scriptHash,scriptCbor, rewardAddress};
        };

    let code = ``
        code += `const blueprint = new WithdrawalBlueprint("V2" ,0);\n`
        code += `blueprint.noParamScript(demoCompiledCode);\n\n`
        code += `const scriptHash = bluerint.hash\n`
        code += `const scriptCbor = bluerint.cbor\n`
        code += `const rewardAddress = blueprint.address;\n\n`
    

      return (
            <LiveCodeDemo
            title="Withdrawal Script blueprint - No parameter to script"
            subtitle="Creates a withdrawal script blueprint with no parameter to script"
            runCodeFunction={runDemo}
            code={code}
            ></LiveCodeDemo>
        );
};
