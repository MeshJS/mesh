import { useWallet } from "@meshsdk/react";

// import { getProvider } from "~/components/cardano/mesh-wallet";
import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder, txbuilderCode } from "../common";

const govActionTxHash =
  "aff2909f8175ee02a8c1bf96ff516685d25bf0c6b95aac91f4dfd53a5c0867cc";
const govActionTxIndex = 0;

export default function GovernanceVote() {
  return (
    <TwoColumnsScroll
      sidebarTo="vote"
      title="Vote"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeDrepId = `const dRep = await wallet.getDRep();\n`;
  codeDrepId += `const dRepId = dRep.dRepIDCip105;\n`;

  let codeWallet = `const utxos = await wallet.getUtxos();\n`;
  codeWallet += `const changeAddress = await wallet.getChangeAddress();\n`;

  let codeTx = `txBuilder\n`;
  codeTx += `  .vote(\n`;
  codeTx += `    {\n`;
  codeTx += `      type: "DRep",\n`;
  codeTx += `      drepId: dRepId,\n`;
  codeTx += `    },\n`;
  codeTx += `    {\n`;
  codeTx += `      txHash: '${govActionTxHash}',\n`;
  codeTx += `      txIndex: ${govActionTxIndex},\n`;
  codeTx += `    },\n`;
  codeTx += `    {\n`;
  codeTx += `      voteKind: "Yes",\n`;
  codeTx += `    },\n`;
  codeTx += `  )\n`;
  codeTx += `  .selectUtxosFrom(utxos)\n`;
  codeTx += `  .changeAddress(changeAddress);\n`;

  let codeSign = `const unsignedTx = await txBuilder.complete();\n`;
  codeSign += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSign += `const txHash = await wallet.submitTx(signedTx);\n`;

  let codeExample1 = ``;
  codeExample1 += `txBuilder\n`;
  codeExample1 += `  .changeAddress(\n`;
  codeExample1 += `    "addr_test1qpsmz8q2xj43wg597pnpp0ffnlvr8fpfydff0wcsyzqyrxguk5v6wzdvfjyy8q5ysrh8wdxg9h0u4ncse4cxhd7qhqjqk8pse6",\n`;
  codeExample1 += `  )\n`;
  codeExample1 += `  .txIn(\n`;
  codeExample1 += `    "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",\n`;
  codeExample1 += `    3,\n`;
  codeExample1 += `    [\n`;
  codeExample1 += `      {\n`;
  codeExample1 += `        unit: "lovelace",\n`;
  codeExample1 += `        quantity: "9891607895",\n`;
  codeExample1 += `      },\n`;
  codeExample1 += `    ],\n`;
  codeExample1 += `    "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",\n`;
  codeExample1 += `  )\n`;
  codeExample1 += `  .vote(\n`;
  codeExample1 += `    {\n`;
  codeExample1 += `      type: "DRep",\n`;
  codeExample1 += `      drepId: "drep1j6257gz2swty9ut46lspyvujkt02pd82am2zq97p7p9pv2euzs7",\n`;
  codeExample1 += `    },\n`;
  codeExample1 += `    {\n`;
  codeExample1 += `      txHash:\n`;
  codeExample1 += `        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",\n`;
  codeExample1 += `      txIndex: 3,\n`;
  codeExample1 += `    },\n`;
  codeExample1 += `    {\n`;
  codeExample1 += `      voteKind: "Yes",\n`;
  codeExample1 += `      anchor: {\n`;
  codeExample1 += `        anchorUrl: "https://path-to.jsonld",\n`;
  codeExample1 += `        anchorDataHash:\n`;
  codeExample1 += `          "2aef51273a566e529a2d5958d981d7f0b3c7224fc2853b6c4922e019657b5060",\n`;
  codeExample1 += `      },\n`;
  codeExample1 += `    },\n`;
  codeExample1 += `  )\n`;

  let codeExample2 = ``;
  codeExample2 += `txBuilder\n`;
  codeExample2 += `  .changeAddress(\n`;
  codeExample2 += `    "addr_test1qpsmz8q2xj43wg597pnpp0ffnlvr8fpfydff0wcsyzqyrxguk5v6wzdvfjyy8q5ysrh8wdxg9h0u4ncse4cxhd7qhqjqk8pse6",\n`;
  codeExample2 += `  )\n`;
  codeExample2 += `  .txIn(\n`;
  codeExample2 += `    "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",\n`;
  codeExample2 += `    3,\n`;
  codeExample2 += `    [\n`;
  codeExample2 += `      {\n`;
  codeExample2 += `        unit: "lovelace",\n`;
  codeExample2 += `        quantity: "9891607895",\n`;
  codeExample2 += `      },\n`;
  codeExample2 += `    ],\n`;
  codeExample2 += `    "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",\n`;
  codeExample2 += `  )\n`;
  codeExample2 += `  .txInCollateral(\n`;
  codeExample2 += `    "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",\n`;
  codeExample2 += `    3,\n`;
  codeExample2 += `    [\n`;
  codeExample2 += `      {\n`;
  codeExample2 += `        unit: "lovelace",\n`;
  codeExample2 += `        quantity: "9891607895",\n`;
  codeExample2 += `      },\n`;
  codeExample2 += `    ],\n`;
  codeExample2 += `    "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",\n`;
  codeExample2 += `  )\n`;
  codeExample2 += `  .votePlutusScriptV3()\n`;
  codeExample2 += `  .vote(\n`;
  codeExample2 += `    {\n`;
  codeExample2 += `      type: "DRep",\n`;
  codeExample2 += `      drepId: resolveScriptHashDRepId(\n`;
  codeExample2 += `        resolveScriptHash(\n`;
  codeExample2 += `          applyCborEncoding(\n`;
  codeExample2 += `            "5834010100323232322533300232323232324a260106012004600e002600e004600a00260066ea8004526136565734aae795d0aba201",\n`;
  codeExample2 += `          ),\n`;
  codeExample2 += `          "V3",\n`;
  codeExample2 += `        ),\n`;
  codeExample2 += `      ),\n`;
  codeExample2 += `    },\n`;
  codeExample2 += `    {\n`;
  codeExample2 += `      txHash:\n`;
  codeExample2 += `        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",\n`;
  codeExample2 += `      txIndex: 3,\n`;
  codeExample2 += `    },\n`;
  codeExample2 += `    {\n`;
  codeExample2 += `      voteKind: "Yes",\n`;
  codeExample2 += `      anchor: {\n`;
  codeExample2 += `        anchorUrl: "https://path-to.jsonld",\n`;
  codeExample2 += `        anchorDataHash:\n`;
  codeExample2 += `          "2aef51273a566e529a2d5958d981d7f0b3c7224fc2853b6c4922e019657b5060",\n`;
  codeExample2 += `      },\n`;
  codeExample2 += `    },\n`;
  codeExample2 += `  )\n`;
  codeExample2 += `  .voteScript(\n`;
  codeExample2 += `    applyCborEncoding(\n`;
  codeExample2 += `      "5834010100323232322533300232323232324a260106012004600e002600e004600a00260066ea8004526136565734aae795d0aba201",\n`;
  codeExample2 += `    ),\n`;
  codeExample2 += `  )\n`;
  codeExample2 += `  .voteRedeemerValue("")\n`;

  return (
    <>
      <p>Each vote transaction consists of the following:</p>
      <ul>
        <li>a governance action ID</li>
        <li>a role - constitutional committee member, DRep, or SPO</li>
        <li>a governance credential witness for the role</li>
        <li>
          an optional anchor (as defined above) for information that is relevant
          to the vote
        </li>
        <li>a 'Yes'/'No'/'Abstain' vote</li>
      </ul>
      <p>
        First, we get the DRep ID from the wallet, the DRep ID voting for this
        governance action.
      </p>
      <Codeblock data={codeDrepId} />
      <p>Then we get the utxos and the change address from the wallet.</p>
      <Codeblock data={codeWallet} />
      <p>
        We then create the vote transaction using the <code>vote()</code>{" "}
        function.
      </p>
      <Codeblock data={codeTx} />
      <p>
        The <code>vote()</code> takes 3 parameters:
      </p>
      <ul>
        <li>
          voter — The voter, can be a Constitutional Commitee, a DRep or a
          StakePool
        </li>
        <li>
          govActionId — The transaction hash and transaction id of the
          governance action
        </li>
        <li>
          votingProcedure — The voting kind (Yes, No, Abstain) with an optional
          anchor
        </li>
      </ul>
      <p>
        Check the{" "}
        <Link href="https://docs.meshjs.dev/transactions/classes/MeshTxBuilder">
          full documentation
        </Link>{" "}
        or the source code for more details.
      </p>
      <p>Finally, we sign the transaction and submit it to the blockchain.</p>
      <Codeblock data={codeSign} />

      <p>
        You can check{" "}
        <Link href="https://preprod.cardanoscan.io/transaction/278d887adc913416e6851106e7ce6e89f29aa7531b93d11e1986550e7a128a2f?tab=votes">
          here
        </Link>{" "}
        a successful vote transaction for this{" "}
        <Link href="https://preprod.cardanoscan.io/govAction/gov_action14lefp8upwhhq92xph7t075txshf9huxxh9d2ey05ml2n5hqgvlxqqp92kfl?tab=votes">
          governance action
        </Link>
        .
      </p>

      <p>Here is another example of a vote transaction:</p>
      <Codeblock data={codeExample1} />

      <p>
        And another example of a vote transaction with a Plutus script and a
        redeemer:
      </p>
      <Codeblock data={codeExample2} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const dRep = await wallet.getDRep();

    if (dRep === undefined)
      throw new Error("No DRep key found, this wallet does not support CIP95");

    const dRepId = dRep.dRepIDCip105;

    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();

    const txBuilder = getTxBuilder();
    txBuilder
      .vote(
        {
          type: "DRep",
          drepId: dRepId,
        },
        {
          txHash: govActionTxHash,
          txIndex: govActionTxIndex,
        },
        {
          voteKind: "Yes",
        },
      )
      .selectUtxosFrom(utxos)
      .changeAddress(changeAddress);

    const unsignedTx = await txBuilder.complete();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = ``;
  codeSnippet += `const dRep = await wallet.getDRep();\n`;
  codeSnippet += `const dRepId = dRep.dRepIDCip105;\n`;
  codeSnippet += `\n`;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n`;
  codeSnippet += `\n`;
  codeSnippet += txbuilderCode;
  codeSnippet += `txBuilder\n`;
  codeSnippet += `  .vote(\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      type: "DRep",\n`;
  codeSnippet += `      drepId: dRepId,\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      txHash: '${govActionTxHash}',\n`;
  codeSnippet += `      txIndex: ${govActionTxIndex},\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      voteKind: "Yes",\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `  )\n`;
  codeSnippet += `  .selectUtxosFrom(utxos)\n`;
  codeSnippet += `  .changeAddress(changeAddress);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await txBuilder.complete();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Vote"
      subtitle="Vote on a governance action"
      code={codeSnippet}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    ></LiveCodeDemo>
  );
}
