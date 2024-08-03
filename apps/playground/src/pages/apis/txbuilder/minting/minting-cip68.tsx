import { useState } from "react";
import Link from "next/link";

import {
  CIP68_100,
  CIP68_222,
  mConStr0,
  metadataToCip68,
  Mint,
  mTxOutRef,
  PlutusScript,
  resolvePlutusScriptAddress,
  resolveScriptHash,
  serializePlutusScript,
  stringToHex,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import {
  demoPlutusAlwaysSucceedScript,
  oneTimeMintingPolicy,
} from "~/data/cardano";
import { getTxBuilder } from "../common";

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

function Left(userInput: string) {
  return (
    <>
      <p>
        <Link
          href="https://cips.cardano.org/cip/CIP-68"
          target="_blank"
          rel="noreferrer"
        >
          CIP-68
        </Link>{" "}
        proposes a metadata standard for assets on the Cardano blockchain, not
        limited to just NFTs but any asset class. It aims to address the
        limitations of a previous standard (
        <Link
          href="https://cips.cardano.org/cip/CIP-25"
          target="_blank"
          rel="noreferrer"
        >
          CIP-25
        </Link>
        ).
      </p>

      <p>
        The basic idea is to have two assets issued, where one references the
        other. We call these two a <code>reference NFT</code> and an{" "}
        <code>user token</code>, where the
        <code>user token</code> can be an NFT, FT or any other asset class that
        is transferable and represents any value. So, the{" "}
        <code>user token</code> is the actual asset that lives in a user's
        wallet.
      </p>
      <p>
        To find the metadata for the <code>user token</code> you need to look
        for the output, where the <code>reference NFT</code> is locked in. How
        this is done concretely will become clear below. Moreover, this output
        contains a datum, which holds the metadata. The advantage of this
        approach is that the issuer of the assets can decide how the transaction
        output with the <code>reference NFT</code> is locked and further
        handled. If the issuer wants complete immutable metadata, the{" "}
        <code>reference NFT</code> can be locked at the address of an
        unspendable script. Similarly, if the issuer wants the NFTs/FTs to
        evolve or wants a mechanism to update the metadata, the{" "}
        <code>reference NFT</code>
        can be locked at the address of a script with arbitrary logic that the
        issuer decides.
      </p>
      <p>
        Lastly and most importantly, with this construction, the metadata can be
        used by a Plutus V2 script with the use of reference inputs (
        <Link
          href="https://cips.cardano.org/cip/CIP-31"
          target="_blank"
          rel="noreferrer"
        >
          CIP-31
        </Link>
        ) . This will drive further innovation in the token space.
      </p>

      {/* <Codeblock data={codeSnippet3} /> */}
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
    const tokenName = "MeshToken";
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
  code += `const tokenName = "MeshToken";\n`;
  code += `const tokenNameHex = stringToHex(tokenName);\n`;
  code += `\n`;
  code += `const txBuilder = getTxBuilder();\n`;
  code += `\n`;
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
