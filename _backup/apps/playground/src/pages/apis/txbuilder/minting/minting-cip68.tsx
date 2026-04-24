import { useState } from "react";

import {
  CIP68_100,
  CIP68_222,
  mConStr0,
  metadataToCip68,
  mTxOutRef,
  PlutusScript,
  resolveScriptHash,
  serializePlutusScript,
  stringToHex,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-cst";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import {
  demoPlutusAlwaysSucceedScript,
  oneTimeMintingPolicy,
} from "~/data/cardano";
import { getTxBuilder, txbuilderCode } from "../common";

export default function MintingCip68() {
  const [userInput, setUserInput] = useState<string>("Test1");

  return (
    <TwoColumnsScroll
      sidebarTo="mintingCip68"
      title="Minting Assets with CIP-68 Metadata standard"
      leftSection={Left(userInput)}
      rightSection={Right(userInput, setUserInput)}
    />
  );
}

let code = `txBuilder
  .mintPlutusScriptV2()
  .mint("1", policyId, CIP68_100(tokenNameHex))
  .mintingScript(scriptCode)
  .mintRedeemerValue(mConStr0([]))
  .mintPlutusScriptV2()
  .mint("1", policyId, CIP68_222(tokenNameHex))
  .mintingScript(scriptCode)
  .mintRedeemerValue(mConStr0([]))`;

function Left(userInput: string) {
  return (
    <>
      <p>
        Minting <Link href="https://cips.cardano.org/cip/CIP-68">CIP-68</Link>{" "}
        tokens with <code>MeshTxBuilder</code> means 2 consecutive sets of
        minting APIs. The first is to mint the 100 token, and the second is the
        mint the 222 tokens:
      </p>

      <Codeblock data={code} />

      <p>
        A side note, Mesh also provides the utility function of{" "}
        <code>CIP68_100(tokenNameHex: string)</code> and
        <code>CIP68_222(tokenNameHex: string)</code> to help easily construct
        the token names as needed. So you dont have to memorize the prefix bytes
        to correctly mint the CIP68-compliant tokens.
      </p>
    </>
  );
}

function Right(userInput: string, setUserInput: (value: string) => void) {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];

    if (address === undefined) {
      throw "Address not found";
    }

    const userTokenMetadata = {
      name: userInput,
      image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",
      mediaType: "image/jpg",
      description: "Hello world - CIP68",
    };

    const alawysSucceedPlutusScript: PlutusScript = {
      code: demoPlutusAlwaysSucceedScript,
      version: "V1",
    };

    const { address: scriptAddress } = serializePlutusScript(
      alawysSucceedPlutusScript,
    );

    const utxos = await wallet.getUtxos();

    if (!utxos || utxos.length <= 0) {
      throw "No UTxOs found in wallet";
    }

    const scriptCode = applyParamsToScript(oneTimeMintingPolicy, [
      mTxOutRef(utxos[0]?.input.txHash!, utxos[0]?.input.outputIndex!),
    ]);

    const collateral: UTxO = (await wallet.getCollateral())[0]!;
    const changeAddress = await wallet.getChangeAddress();

    const policyId = resolveScriptHash(scriptCode, "V2");
    const tokenName = userInput;
    const tokenNameHex = stringToHex(tokenName);

    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .txIn(
        utxos[0]?.input.txHash!,
        utxos[0]?.input.outputIndex!,
        utxos[0]?.output.amount!,
        utxos[0]?.output.address!,
      )
      .mintPlutusScriptV2()
      .mint("1", policyId, CIP68_100(tokenNameHex))
      .mintingScript(scriptCode)
      .mintRedeemerValue(mConStr0([]))
      .mintPlutusScriptV2()
      .mint("1", policyId, CIP68_222(tokenNameHex))
      .mintingScript(scriptCode)
      .mintRedeemerValue(mConStr0([]))
      .txOut(scriptAddress, [
        { unit: policyId + CIP68_100(tokenNameHex), quantity: "1" },
      ])
      .txOutInlineDatumValue(metadataToCip68(userTokenMetadata))
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .complete();

    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let code = ``;
  code += `const usedAddress = await wallet.getUsedAddresses();\n`;
  code += `const address = usedAddress[0];\n`;
  code += `\n`;
  code += `if (address === undefined) {\n`;
  code += `  throw "Address not found";\n`;
  code += `}\n`;
  code += `\n`;
  code += `const userTokenMetadata = {\n`;
  code += `  name: userInput,\n`;
  code += `  image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",\n`;
  code += `  mediaType: "image/jpg",\n`;
  code += `  description: "Hello world - CIP68",\n`;
  code += `};\n`;
  code += `\n`;
  code += `const alawysSucceedPlutusScript: PlutusScript = {\n`;
  code += `  code: demoPlutusAlwaysSucceedScript,\n`;
  code += `  version: "V1",\n`;
  code += `};\n`;
  code += `\n`;
  code += `const { address: scriptAddress } = serializePlutusScript(\n`;
  code += `  alawysSucceedPlutusScript,\n`;
  code += `);\n`;
  code += `\n`;
  code += `const utxos = await wallet.getUtxos();\n`;
  code += `\n`;
  code += `if (!utxos || utxos.length <= 0) {\n`;
  code += `  throw "No UTxOs found in wallet";\n`;
  code += `}\n`;
  code += `\n`;
  code += `const scriptCode = applyParamsToScript(oneTimeMintingPolicy, [\n`;
  code += `  mTxOutRef(utxos[0]?.input.txHash!, utxos[0]?.input.outputIndex!),\n`;
  code += `]);\n`;
  code += `\n`;
  code += `const collateral: UTxO = (await wallet.getCollateral())[0]!;\n`;
  code += `const changeAddress = await wallet.getChangeAddress();\n`;
  code += `\n`;
  code += `const policyId = resolveScriptHash(scriptCode, "V2");\n`;
  code += `const tokenName = '${userInput}';\n`;
  code += `const tokenNameHex = stringToHex(tokenName);\n`;
  code += `\n`;
  code += txbuilderCode;
  code += `const unsignedTx = await txBuilder\n`;
  code += `  .txIn(\n`;
  code += `    utxos[0]?.input.txHash!,\n`;
  code += `    utxos[0]?.input.outputIndex!,\n`;
  code += `    utxos[0]?.output.amount!,\n`;
  code += `    utxos[0]?.output.address!,\n`;
  code += `  )\n`;
  code += `  .mintPlutusScriptV2()\n`;
  code += `  .mint("1", policyId, CIP68_100(tokenNameHex))\n`;
  code += `  .mintingScript(scriptCode)\n`;
  code += `  .mintRedeemerValue(mConStr0([]))\n`;
  code += `  .mintPlutusScriptV2()\n`;
  code += `  .mint("1", policyId, CIP68_222(tokenNameHex))\n`;
  code += `  .mintingScript(scriptCode)\n`;
  code += `  .mintRedeemerValue(mConStr0([]))\n`;
  code += `  .txOut(scriptAddress, [\n`;
  code += `    { unit: policyId + CIP68_100(tokenNameHex), quantity: "1" },\n`;
  code += `  ])\n`;
  code += `  .txOutInlineDatumValue(metadataToCip68(userTokenMetadata))\n`;
  code += `  .changeAddress(changeAddress)\n`;
  code += `  .selectUtxosFrom(utxos)\n`;
  code += `  .txInCollateral(\n`;
  code += `    collateral.input.txHash,\n`;
  code += `    collateral.input.outputIndex,\n`;
  code += `    collateral.output.amount,\n`;
  code += `    collateral.output.address,\n`;
  code += `  )\n`;
  code += `  .complete();\n`;
  code += `\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Mint Assets with CIP68 metadata standard"
      subtitle="Mint assets with CIP68 metadata standard where two assets are issued, one referencing the other user token."
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
      code={code}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Token Name"
            label="Token Name"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
