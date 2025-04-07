import { MeshMarketplaceContract } from "@meshsdk/contract";
import { integer, mPubKeyAddress, pubKeyAddress } from "@meshsdk/core";
import { applyParamsToScript, CardanoSDKSerializer } from "@meshsdk/core-cst";

import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import {
  demoPlutusMintingScript,
  demoPubKeyHash,
  demoStakeCredential,
} from "~/data/cardano";

const serializer = new CardanoSDKSerializer();

const demoCompiledCode = MeshMarketplaceContract.getCompiledCode();

export default function ContractApplyParamToScript() {
  return (
    <TwoColumnsScroll
      sidebarTo="applyParamToScript"
      title="Apply Parameters to Script"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeAikenScript1 = ``;
  codeAikenScript1 += `pub fn marketplace_logic(\n`;
  codeAikenScript1 += `  owner: Address, // parameter 1\n`;
  codeAikenScript1 += `  fee_percentage_basis_point: Int, // parameter 2\n`;
  codeAikenScript1 += `  datum: MarketplaceDatum,\n`;
  codeAikenScript1 += `  redeemer: MarketplaceRedeemer,\n`;
  codeAikenScript1 += `  ctx: ScriptContext,\n`;
  codeAikenScript1 += `) -> Bool {\n`;

  let applyScript1 = ``;
  applyScript1 += `scriptCbor = applyParamsToScript(\n`;
  applyScript1 += `  compiledCode,\n`;
  applyScript1 += `  [\n`;
  applyScript1 += `    pubKeyAddress(pubKeyHash, stakeCredential),\n`;
  applyScript1 += `    integer(feePercentageBasisPoint),\n`;
  applyScript1 += `  ],\n`;
  applyScript1 += `  "JSON",\n`;
  applyScript1 += `);\n`;

  let signature = ``;
  signature += `applyParamsToScript(\n`;
  signature += `  rawScript: string, \n`;
  signature += `  params: object[] | Data[], \n`;
  signature += `  type?: PlutusDataType\n`;
  signature += `): string\n`;

  return (
    <>
      <p>
        Apply parameters to a script allows you to create a custom{" "}
        <Link href="https://cips.cardano.org/cip/cip-57">
          CIP-57 compliant script
        </Link>{" "}
        based on some inputs. For example, for the{" "}
        <Link href="/smart-contracts/marketplace">Marketplace contract</Link>,
        we define the owner of the marketplace and the fee percentage that the
        owner will receive. The script will be created based on these parameters
        which will return a unique script CBOR and script address.
      </p>

      <p>
        <code>applyParamsToScript</code> has the following signature:
      </p>
      <Codeblock data={signature} />
      <p>
        The parameters allowed for a script depends on how the script is
        written. For example the{" "}
        <Link
          href={`https://github.com/MeshJS/mesh/blob/main/packages/mesh-contracts/src/marketplace/aiken-workspace/lib/marketplace/validators/marketplace.ak`}
        >
          Marketplace script
        </Link>
        :
      </p>
      <Codeblock data={codeAikenScript1} />
      <p>
        Thus, in order to apply parameters to this script, we resolve the pubkey
        address and the fee percentage basis point:
      </p>
      <Codeblock data={applyScript1} />
      <p>
        With Mesh, there are 3 <code>PlutusData</code> types of parameters that
        can be applied to a script. For more details about the 3 types, please
        refer to the{" "}
        <Link href={"/apis/data/plutus"}>
          documentation on <code>PlutusData</code>
        </Link>
      </p>
      <ul>
        <li>
          <b>Mesh (default)</b>
        </li>
        <li>
          <b>JSON</b>
        </li>
        <li>
          <b>CBOR</b>
        </li>
      </ul>
    </>
  );
}

function Right() {
  return (
    <>
      <DemoMeshType />
      <DemoJsonType />
      <DemoCborType />
    </>
  );
}

function DemoMeshType() {
  async function runDemo() {
    const scriptCbor = applyParamsToScript(
      demoPlutusMintingScript,
      [mPubKeyAddress(demoPubKeyHash, demoStakeCredential), 100],
      "Mesh",
    );
    return scriptCbor;
  }

  let code = `import { applyParamsToScript } from "@meshsdk/core-cst"; \n\n`;
  code += `const scriptCbor = applyParamsToScript(\n`;
  code += `  '<compiled_script_here>',\n`;
  code += `  [mPubKeyAddress('${demoPubKeyHash}', '${demoStakeCredential}'), 100],\n`;
  code += `  "Mesh",\n`;
  code += `);\n`;

  return (
    <LiveCodeDemo
      title="Apply Parameters to Script - Mesh type"
      subtitle="Apply parameters to a script to create a custom script."
      runCodeFunction={runDemo}
      code={code}
    ></LiveCodeDemo>
  );
}

function DemoJsonType() {
  async function runDemo() {
    const scriptCbor = applyParamsToScript(
      demoCompiledCode,
      [pubKeyAddress(demoPubKeyHash, demoStakeCredential), integer(100)],
      "JSON",
    );
    return scriptCbor;
  }

  let code = ``;
  code += `const scriptCbor = applyParamsToScript(\n`;
  code += `  '<compiled_script_here>',\n`;
  code += `  [pubKeyAddress('${demoPubKeyHash}', '${demoStakeCredential}'), integer(100)],\n`;
  code += `  "JSON",\n`;
  code += `);\n`;

  return (
    <LiveCodeDemo
      title="Apply Parameters to Script - JSON type"
      subtitle="Apply parameters to a script to create a custom script."
      runCodeFunction={runDemo}
      code={code}
    ></LiveCodeDemo>
  );
}

function DemoCborType() {
  const pubKeyAddressCbor = serializer.serializeData({
    type: "JSON",
    content: JSON.stringify(pubKeyAddress(demoPubKeyHash, demoStakeCredential)),
  });

  const integerCbor = serializer.serializeData({
    type: "JSON",
    content: JSON.stringify(integer(100)),
  });

  async function runDemo() {
    const scriptCbor = applyParamsToScript(
      demoPlutusMintingScript,
      [pubKeyAddressCbor, integerCbor],
      "CBOR",
    );
    return scriptCbor;
  }

  let code = ``;
  code += `const scriptCbor = applyParamsToScript(\n`;
  code += `  '<compiled_script_here>',\n`;
  code += `  ['${pubKeyAddressCbor}', '${integerCbor}'],\n`;
  code += `  "CBOR",\n`;
  code += `);\n`;

  return (
    <LiveCodeDemo
      title="Apply Parameters to Script - CBOR type"
      subtitle="Apply parameters to a script to create a custom script."
      runCodeFunction={runDemo}
      code={code}
    ></LiveCodeDemo>
  );
}
