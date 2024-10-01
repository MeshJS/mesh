import { useState } from "react";

import { keepRelevant, Quantity, Unit } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder } from "../common";

export default function GovernanceVoteDelegation() {
  return (
    <TwoColumnsScroll
      sidebarTo="delegation"
      title="Vote Delegation"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeGetWalletInfo = ``;
  codeGetWalletInfo += `const utxos = await wallet.getUtxos();\n`;
  codeGetWalletInfo += `const rewardAddresses = await wallet.getRewardAddresses();\n`;
  codeGetWalletInfo += `const rewardAddress = rewardAddresses[0];\n`;
  codeGetWalletInfo += `const changeAddress = await wallet.getChangeAddress();\n`;

  let codeUtxo = ``;
  codeUtxo += `const assetMap = new Map<Unit, Quantity>();\n`;
  codeUtxo += `assetMap.set("lovelace", "5000000");\n`;
  codeUtxo += `const selectedUtxos = keepRelevant(assetMap, utxos);\n`;

  let codeTx = ``;
  codeTx += `for (const utxo of selectedUtxos) {\n`;
  codeTx += `  txBuilder.txIn(\n`;
  codeTx += `    utxo.input.txHash,\n`;
  codeTx += `    utxo.input.outputIndex,\n`;
  codeTx += `    utxo.output.amount,\n`;
  codeTx += `    utxo.output.address,\n`;
  codeTx += `  );\n`;
  codeTx += `}\n`;
  codeTx += `\n`;
  codeTx += `txBuilder\n`;
  codeTx += `  .voteDelegationCertificate(\n`;
  codeTx += `    {\n`;
  codeTx += `      dRepId: drepid,\n`;
  codeTx += `    },\n`;
  codeTx += `    rewardAddress,\n`;
  codeTx += `  )\n`;
  codeTx += `  .changeAddress(changeAddress);\n`;

  let codeBuildSign = ``;
  codeBuildSign += `const unsignedTx = await txBuilder.complete();\n`;
  codeBuildSign += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeBuildSign += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        Any wallet can delegate its voting power to another DRep. This is done
        by creating a vote delegation certificate and submitting it to the
        blockchain.
      </p>
      <p>
        First we need to get the wallet information. This includes the UTXOs,
        the reward address, and the change address.
      </p>
      <Codeblock data={codeGetWalletInfo} />
      <p>
        Next we need to select the UTXOs to use to pay for the transaction. We
        will select the UTXOs that have at least 5 ADA. Though the fee is less
        than 1 ADA.
      </p>
      <Codeblock data={codeUtxo} />
      <p>
        We can now start building the transaction. We will add the selected
        UTXOs as inputs to the transaction. We will also add the vote delegation
        certificate to the transaction. The vote delegation certificate requires
        the DRep ID of the DRep to delegate to and the reward address of the
        delegator.
      </p>
      <Codeblock data={codeTx} />
      <p>
        Finally we can build, sign the transaction and submit it to the
        blockchain.
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
  const [drepid, setDrepid] = useState<string>("");

  async function runDemo() {
    if (!connected) throw new Error("Wallet not connected");

    const utxos = await wallet.getUtxos();
    const rewardAddresses = await wallet.getRewardAddresses();
    const rewardAddress = rewardAddresses[0];
    if (rewardAddress === undefined) throw new Error("No reward address found");

    const changeAddress = await wallet.getChangeAddress();

    const assetMap = new Map<Unit, Quantity>();
    assetMap.set("lovelace", "5000000");
    const selectedUtxos = keepRelevant(assetMap, utxos);

    const txBuilder = getTxBuilder();

    for (const utxo of selectedUtxos) {
      txBuilder.txIn(
        utxo.input.txHash,
        utxo.input.outputIndex,
        utxo.output.amount,
        utxo.output.address,
      );
    }

    txBuilder
      .voteDelegationCertificate(
        {
          dRepId: drepid,
        },
        rewardAddress,
      )
      .changeAddress(changeAddress);

    const unsignedTx = await txBuilder.complete();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let codeSnippet = ``;
  codeSnippet += `const utxos = await wallet.getUtxos();\n`;
  codeSnippet += `const rewardAddresses = await wallet.getRewardAddresses();\n`;
  codeSnippet += `const rewardAddress = rewardAddresses[0];\n`;
  codeSnippet += `\n`;
  codeSnippet += `const changeAddress = await wallet.getChangeAddress();\n`;
  codeSnippet += `\n`;
  codeSnippet += `const assetMap = new Map<Unit, Quantity>();\n`;
  codeSnippet += `assetMap.set("lovelace", "5000000");\n`;
  codeSnippet += `const selectedUtxos = keepRelevant(assetMap, utxos);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const txBuilder = getTxBuilder();\n`;
  codeSnippet += `\n`;
  codeSnippet += `for (const utxo of selectedUtxos) {\n`;
  codeSnippet += `  txBuilder.txIn(\n`;
  codeSnippet += `    utxo.input.txHash,\n`;
  codeSnippet += `    utxo.input.outputIndex,\n`;
  codeSnippet += `    utxo.output.amount,\n`;
  codeSnippet += `    utxo.output.address,\n`;
  codeSnippet += `  );\n`;
  codeSnippet += `}\n`;
  codeSnippet += `\n`;
  codeSnippet += `txBuilder\n`;
  codeSnippet += `  .voteDelegationCertificate(\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      dRepId: drepid,\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `    rewardAddress,\n`;
  codeSnippet += `  )\n`;
  codeSnippet += `  .changeAddress(changeAddress);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await txBuilder.complete();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="DRep Vote Delegation"
      subtitle="Delegate your voting power to another DRep"
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
            value={drepid}
            onChange={(e) => setDrepid(e.target.value)}
            placeholder="drep..."
            label="DRep ID"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
