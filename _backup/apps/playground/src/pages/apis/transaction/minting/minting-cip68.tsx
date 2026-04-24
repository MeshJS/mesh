import { useState } from "react";

import {
  DEFAULT_REDEEMER_BUDGET,
  Mint,
  mTxOutRef,
  PlutusScript,
  resolvePlutusScriptAddress,
  Transaction,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-cst";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import {
  demoPlutusAlwaysSucceedScript,
  oneTimeMintingPolicy,
} from "~/data/cardano";

export default function MintingCip68() {
  return (
    <TwoColumnsScroll
      sidebarTo="mintingCip68"
      title="Minting Assets with CIP-68 Metadata standard"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <Link href="https://cips.cardano.org/cip/CIP-68">CIP-68</Link> proposes
        a metadata standard for assets on the Cardano blockchain, not limited to
        just NFTs but any asset class. It aims to address the limitations of a
        previous standard (
        <Link href="https://cips.cardano.org/cip/CIP-25">CIP-25</Link>
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
        <Link href="https://cips.cardano.org/cip/CIP-31">CIP-31</Link>) . This
        will drive further innovation in the token space.
      </p>

      {/* <Codeblock data={codeSnippet3} /> */}
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("MeshCIP68");

  async function runDemo() {
    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];

    if (address === undefined) {
      throw "Address not found";
    }

    const redeemer = {
      data: { alternative: 0, fields: [] },
      tag: "MINT",
      budget: DEFAULT_REDEEMER_BUDGET,
    };

    const alawysSucceedPlutusScript: PlutusScript = {
      code: demoPlutusAlwaysSucceedScript,
      version: "V2",
    };

    const scriptAddress = resolvePlutusScriptAddress(
      alawysSucceedPlutusScript,
      address.substring(0, 5) === "addr1" ? 1 : 0,
    );

    const userTokenMetadata = {
      name: userInput,
      image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",
      mediaType: "image/jpg",
      description: "Hello world - CIP68",
    };

    const cip68Token: Mint = {
      assetName: userInput,
      assetQuantity: "1",
      metadata: userTokenMetadata,
      recipient: address,
      cip68ScriptAddress: scriptAddress,
    };

    const utxos = await wallet.getUtxos();

    if (!utxos || utxos.length <= 0) {
      throw "No UTxOs found in wallet";
    }

    const scriptCode = applyParamsToScript(oneTimeMintingPolicy, [
      mTxOutRef(utxos[0]?.input.txHash!, utxos[0]?.input.outputIndex!),
    ]);
    const script: PlutusScript = {
      code: scriptCode,
      version: "V2",
    };

    const tx = new Transaction({ initiator: wallet })
      .setNetwork("preprod")
      .setTxInputs([utxos[0]!])
      .mintAsset(script, cip68Token, redeemer);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let code = ``;
  code += `const usedAddress = await wallet.getUsedAddresses();\n`;
  code += `const address = usedAddress[0];\n`;
  code += `\n`;
  code += `const redeemer = {\n`;
  code += `  data: { alternative: 0, fields: [] },\n`;
  code += `  tag: "MINT",\n`;
  code += `  budget: DEFAULT_REDEEMER_BUDGET,\n`;
  code += `};\n`;
  code += `\n`;
  code += `const alawysSucceedPlutusScript: PlutusScript = {\n`;
  code += `  code: demoPlutusAlwaysSucceedScript,\n`;
  code += `  version: "V2",\n`;
  code += `};\n`;
  code += `\n`;
  code += `const scriptAddress = resolvePlutusScriptAddress(\n`;
  code += `  alawysSucceedPlutusScript,\n`;
  code += `  address.substring(0, 5) === "addr1" ? 1 : 0,\n`;
  code += `);\n`;
  code += `\n`;
  code += `const userTokenMetadata = {\n`;
  code += `  name: '${userInput}',\n`;
  code += `  image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",\n`;
  code += `  mediaType: "image/jpg",\n`;
  code += `  description: "Hello world - CIP68",\n`;
  code += `};\n`;
  code += `\n`;
  code += `const cip68Token: Mint = {\n`;
  code += `  assetName: '${userInput}',\n`;
  code += `  assetQuantity: "1",\n`;
  code += `  metadata: userTokenMetadata,\n`;
  code += `  recipient: address,\n`;
  code += `  cip68ScriptAddress: scriptAddress,\n`;
  code += `};\n`;
  code += `\n`;
  code += `const utxos = await wallet.getUtxos();\n`;
  code += `\n`;
  code += `const scriptCode = applyParamsToScript(oneTimeMintingPolicy, [\n`;
  code += `  mTxOutRef(utxos[0]?.input.txHash!, utxos[0]?.input.outputIndex!),\n`;
  code += `]);\n`;
  code += `const script: PlutusScript = {\n`;
  code += `  code: scriptCode,\n`;
  code += `  version: "V2",\n`;
  code += `};\n`;
  code += `\n`;
  code += `const tx = new Transaction({ initiator: wallet })\n`;
  code += `  .setTxInputs([utxos[0]!])\n`;
  code += `  .mintAsset(script, cip68Token, redeemer);\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
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
