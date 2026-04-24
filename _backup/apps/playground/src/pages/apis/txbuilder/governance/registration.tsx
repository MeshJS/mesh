import { useState } from "react";

import {
  getFile,
  hashDrepAnchor,
  keepRelevant,
  Quantity,
  Unit,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder, txbuilderCode } from "../common";

export default function GovernanceRegistration() {
  return (
    <TwoColumnsScroll
      sidebarTo="registration"
      title="DRep Registration"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeDrepId = ``;
  codeDrepId += `const dRep = await wallet.getDRep();\n`;
  codeDrepId += `const dRepId = dRep.dRepIDCip105;\n`;

  let codeAnchor = ``;
  codeAnchor += `async function getMeshJsonHash(url: string) {\n`;
  codeAnchor += `  var drepAnchor = getFile(url);\n`;
  codeAnchor += `  const anchorObj = JSON.parse(drepAnchor);\n`;
  codeAnchor += `  return hashDrepAnchor(anchorObj);\n`;
  codeAnchor += `}\n`;
  codeAnchor += `\n`;
  codeAnchor += `const anchorUrl = "https://meshjs.dev/governance/meshjs.jsonld";\n`;
  codeAnchor += `const anchorHash = await getMeshJsonHash(anchorUrl);\n`;

  let codeTx = ``;
  codeTx += `const utxos = await wallet.getUtxos();\n`;
  codeTx += `const changeAddress = await wallet.getChangeAddress();\n\n`;
  codeTx += txbuilderCode;
  codeTx += `txBuilder\n`;
  codeTx += `  .drepRegistrationCertificate(dRepId, {\n`;
  codeTx += `    anchorUrl: anchorUrl,\n`;
  codeTx += `    anchorDataHash: anchorHash,\n`;
  codeTx += `  })\n`;
  codeTx += `  .changeAddress(changeAddress)\n`;
  codeTx += `  .selectUtxosFrom(selectedUtxos);\n`;

  let codeBuildSign = ``;
  codeBuildSign += `const unsignedTx = await txBuilder.complete();\n`;
  codeBuildSign += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeBuildSign += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        In Voltaire, stake credentials can delegate their stake to Decentralized
        Representatives (DReps) for voting, in addition to the current
        delegation to stake pools for block production. This DRep delegation
        will work similarly to the current stake delegation process, using
        on-chain certificates. Registering as a DRep will also follow the same
        process as stake registration.
      </p>
      <p>
        However, registered DReps need to vote regularly to remain active. If a
        DRep does not vote for a set number of epochs (defined by the new
        protocol parameter, drepActivity), they are considered inactive and will
        not count towards the active voting stake. To become active again, DReps
        need to vote on governance actions or submit a DRep update certificate
        within the drepActivity period.
      </p>

      <p>A DRep registration certificates include:</p>
      <ul>
        <li>a DRep ID</li>
        <li>a deposit</li>
        <li>an optional anchor</li>
      </ul>
      <p>An anchor is a pair of:</p>
      <ul>
        <li>a URL to a JSON payload of metadata</li>
        <li>a hash of the contents of the metadata URL</li>
      </ul>

      <p>
        First we need to get the DRep ID of the DRep we want to register. We can
        do this by calling <code>getDRep</code> method on the wallet. This will
        return the DRep object which contains the DRep ID.
      </p>
      <Codeblock data={codeDrepId} />
      <p>
        Next we need to get the hash of the anchor. We can do this by calling
        the <code>getMeshJsonHash</code> function. This function fetches the
        anchor from the given URL and returns the hash of the anchor.
      </p>
      <Codeblock data={codeAnchor} />
      <p>
        We can now build the transaction by adding the DRep registration
        certificate to the transaction. We also need to add the change address
        and the selected UTxOs to the transaction. Note that the deposit for
        registering a DRep is 500 ADA, we would set 505 ADA as UTxO selection
        threshold.
      </p>
      <Codeblock data={codeTx} />
      <p>
        Finally we can sign the transaction and submit it to the blockchain.
      </p>
      <Codeblock data={codeBuildSign} />
      <p>
        The transaction will be submitted to the blockchain and the DRep will be
        registered. The deposit will be taken from the DRep owner and the DRep
        will be added to the list of registered DReps.
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

    // get utxo to pay for the registration
    const utxos = await wallet.getUtxos();

    const changeAddress = await wallet.getChangeAddress();

    const txBuilder = getTxBuilder();
    txBuilder
      .drepRegistrationCertificate(dRepId, anchor)
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
  codeSnippet += `// get utxo to pay for the registration\n`;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `txBuilder\n`;
  codeSnippet += `  .drepRegistrationCertificate(dRepId, {\n`;
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
      title="DRep Registration"
      subtitle="Register a DRep certificate and pay the deposit"
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
