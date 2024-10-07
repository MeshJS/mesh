import { useWallet } from "@meshsdk/react";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder } from "../common";

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
  let codeDrepId = ``;

  let codeSign = ``;
  codeSign += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSign += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p></p>
      {/* "Yes" | "No" | "Abstain" */}
      <Codeblock data={codeDrepId} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const govActionTxHash =
      "0ecc74fe26532cec1ab9a299f082afc436afc888ca2dc0fc6acda431c52dc60d";
    const govActionTxIndex = 0;

    // const blockchainProvider = getProvider();
    // const proposals = await blockchainProvider.get(`governance/proposals`);
    // console.log(1, proposals);

    // const votes = await blockchainProvider.get(`governance/proposals/${govActionTxHash}/${govActionTxIndex}/votes`);
    // console.log(1, votes);

    // return '';

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
    console.log(1, signedTx);
    return signedTx
    // const txHash = await wallet.submitTx(signedTx);
    // return txHash;

    return "";
  }

  let codeSnippet = ``;
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
