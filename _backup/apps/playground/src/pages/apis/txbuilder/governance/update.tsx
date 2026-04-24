import { useState } from "react";

import { getFile, hashDrepAnchor } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder, txbuilderCode } from "../common";

export default function GovernanceUpdate() {
  return (
    <TwoColumnsScroll
      sidebarTo="update"
      title="DRep Update"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeTx = ``;
  codeTx += `const utxos = await wallet.getUtxos();\n`;
  codeTx += `const changeAddress = await wallet.getChangeAddress();\n\n`;
  codeTx += txbuilderCode;
  codeTx += `txBuilder\n`;
  codeTx += `  .drepUpdateCertificate(dRepId, {\n`;
  codeTx += `    anchorUrl: anchorUrl,\n`;
  codeTx += `    anchorDataHash: anchorHash,\n`;
  codeTx += `  })\n`;
  codeTx += `  .changeAddress(utxos)\n`;
  codeTx += `  .selectUtxosFrom(selectedUtxos);\n`;

  return (
    <>
      <p>Updating a DRep is similar to registering.</p>
      <p>
        We build the transaction by adding the DRep update certificate to the
        transaction, providing the change address and the UTxOs needed for the
        transaction's fees.
      </p>
      <Codeblock data={codeTx} />
      <p>
        This{" "}
        <Link href="https://preprod.cardanoscan.io/transaction/4527e43097fb6135cf820a90f7cd30dba0b6463078ba9fa61305cbd7d1fa4e2f">
          transaction
        </Link>{" "}
        is an example of a successful DRep update for{" "}
        <Link href="https://preprod.cardanoscan.io/drep/drep1ytk3r5ddfk2cq66ygdtkwf9yck6hhy7uzhk2tgl5d53448skyutw7?tab=dRepUpdates">
          DRep ID
        </Link>
        .
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [anchorUrl, setAnchorUrl] = useState<string>("");

  async function getMeshJsonHash(url: string) {
    var drepAnchor = getFile(url);
    const anchorObj = JSON.parse(drepAnchor);
    const anchorHash = hashDrepAnchor(anchorObj);
    return anchorHash;
  }

  async function runDemo() {
    const dRep = await wallet.getDRep();

    if (dRep === undefined)
      throw new Error("No DRep key found, this wallet does not support CIP95");

    const dRepId = dRep.dRepIDCip105;

    let anchor: { anchorUrl: string; anchorDataHash: string } | undefined =
      undefined;
    if (anchorUrl.length > 0) {
      const anchorHash = await getMeshJsonHash(anchorUrl);
      anchor = {
        anchorUrl: anchorUrl,
        anchorDataHash: anchorHash,
      };
    }

    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();

    const txBuilder = getTxBuilder();
    txBuilder
      .drepUpdateCertificate(dRepId, anchor)
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos);

    const unsignedTx = await txBuilder.complete();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = ``;
  codeSnippet += `const dRep = await wallet.getDRep();\n`;
  codeSnippet += `const dRepId = dRep.dRepIDCip105;\n`;
  codeSnippet += `\n`;
  codeSnippet += `const anchorUrl = '${anchorUrl}';\n`;
  codeSnippet += `const anchorHash = await getMeshJsonHash(anchorUrl);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `txBuilder\n`;
  codeSnippet += `  .drepUpdateCertificate(dRepId, {\n`;
  codeSnippet += `    anchorUrl: anchorUrl,\n`;
  codeSnippet += `    anchorDataHash: anchorHash,\n`;
  codeSnippet += `  })\n`;
  codeSnippet += `  .changeAddress(changeAddress)\n`;
  codeSnippet += `  .selectUtxosFrom(utxos);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await txBuilder.complete();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="DRep Update"
      subtitle="Update DRep metadata"
      code={codeSnippet}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    >
      <InputTable
        listInputs={[
          <Input
            value={anchorUrl}
            onChange={(e) => setAnchorUrl(e.target.value)}
            placeholder="Anchor Url (e.g. https://path.to/file-name.jsonld)"
            label="Anchor Url"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
