import { useState } from "react";

import { BlockfrostProvider, MeshWallet } from "@meshsdk/core";
import { HydraInstance, HydraProvider } from "@meshsdk/hydra";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { useProviders } from "~/hooks/useProviders";

export default function HydraCommit({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  const [commitUtxo, setCommitUtxo] = useState<string>("");
  const [keyToSign, setKeyToSign] = useState<string>("");

  return (
    <TwoColumnsScroll
      sidebarTo="commit"
      title="Commit to Hydra Head"
      leftSection={Left(commitUtxo)}
      rightSection={Right(
        provider,
        providerName,
        commitUtxo,
        setCommitUtxo,
        keyToSign,
        setKeyToSign,
      )}
    />
  );
}

function Left(commitUtxo: string) {
  const [txHash, txIndex] = commitUtxo.split("#");
  return (
    <>
      <p>
        Commit a particular UTxO to the head. This will make the UTxO available
        on the layer 2.
      </p>
      <Codeblock data={`await instance.commit("${txHash}", ${txIndex});`} />
    </>
  );
}

function Right(
  provider: HydraProvider,
  providerName: string,
  commitUtxo: string,
  setCommitUtxo: (value: string) => void,
  keyToSign: string,
  setKeyToSign: (value: string) => void,
) {
  const blockfrost = getProvider();
  const instance = new HydraInstance({
    provider,
    fetcher: blockfrost,
    submitter: blockfrost,
  });
  const [txHash, txIndex] = commitUtxo.split("#");
  async function runDemo() {
    if (txHash === undefined) {
      return;
    }
    const unsignedTx = await instance.commitFunds(txHash, Number(txIndex));
    const wallet = new MeshWallet({
      key: {
        type: "cli",
        payment: keyToSign,
      },
      networkId: 0,
    });
    const signedTx = await wallet.signTx(unsignedTx, true);
    const commitTxHash = await blockfrost.submitTx(signedTx);
    console.log("CommitTxHash", commitTxHash);
  }

  return (
    <LiveCodeDemo
      title="Commit to Hydra Head"
      subtitle="Commit a utxo to the hydra head"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    >
      <InputTable
        listInputs={[
          <Input
            value={commitUtxo}
            onChange={(e) => setCommitUtxo(e.target.value)}
            placeholder="TxHash#Index"
            label="CommitUtxo"
            key={0}
          />,
          <Input
            value={keyToSign}
            onChange={(e) => setKeyToSign(e.target.value)}
            placeholder="Key to sign to spend utxo"
            label="KeyToSign"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
