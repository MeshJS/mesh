import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";
import { HydraInstance, HydraProvider } from "@meshsdk/hydra";

import Button from "~/components/button/button";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { useWallet } from "@meshsdk/react";
import { getTxBuilder } from "~/pages/apis/txbuilder/common";
import InputTable from "~/components/sections/input-table";
import Input from "~/components/form/input";

export default function HydraTutorialStep3({
  hydraInstance,
  provider,
  providerName,
}: {
  hydraInstance: HydraInstance;
  aliceNode: MeshWallet | undefined;
  aliceFunds: MeshWallet | undefined;
  bobNode: MeshWallet | undefined;
  bobFunds: MeshWallet | undefined;
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step3"
      title="Step 3. Open a Hydra head"
      leftSection={Left(
        hydraInstance,
      )}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left(
  hydraInstance: HydraInstance,
) {
  const [loading, setLoading] = useState<boolean>(false);
 
  async function openHead() {
    await hydraInstance.provider.init();
  }

  async function commitFunds() {
    // commit alice funds
    // await hydraInstance.commitFunds();
    // commit bob funds
    // await hydraInstance.commitFunds();
  }

  return (
    <>
      <p>
        We can now communicate with the hydra-node through its WebSocket API on
        the terminal. This is a duplex connection and we can just insert
        commands directly.
      </p>
      <p>
        Send this command to initialize a head through the WebSocket connection:
      </p>

      <Codeblock data={`await hydraInstance.provider.init();`} />

      <p>
        The initiation process might take some time as it includes submitting a
        transaction on-chain. Upon successful initiation, both Hydra nodes and
        their clients will display a <code>HeadIsInitializing</code> message,
        listing the parties required to commit.
      </p>

      <p>
        To commit funds to the head, choose which UTxO you would like to make
        available on layer 2. Use the HTTP API of hydra-node to commit all funds
        given to <code>{"{alice,bob}-funds.vk"}</code> beforehand:
      </p>

      {/* todo, for alice and bob */}
      {/* https://hydra.family/head-protocol/docs/tutorial/#step-4-open-a-hydra-head */}

      {/* cardano-cli query utxo \
  --address $(cat credentials/alice-funds.addr) \
  --out-file alice-commit-utxo.json

curl -X POST 127.0.0.1:4001/commit \
  --data @alice-commit-utxo.json \
  > alice-commit-tx.json

cardano-cli transaction sign \
  --tx-file alice-commit-tx.json \
  --signing-key-file credentials/alice-funds.sk \
  --out-file alice-commit-tx-signed.json

cardano-cli transaction submit --tx-file alice-commit-tx-signed.json */}

      <Codeblock data={`code about starting node`} />

      <p>
        After you've prepared your transactions, the hydra-node will find all
        UTxOs associated with the funds key and create a draft of the commit
        transaction. You'll then sign this transaction using the funds key and
        submit it to the Cardano layer 1 network.
      </p>

      <p>
        Once the hydra-node sees this transaction, you should see a Committed
        status displayed on your WebSocket connection.
      </p>

      <p>
        When both parties, alice and bob, have committed, the Hydra head will
        open automatically. You'll see a HeadIsOpen message appear in the
        WebSocket session, confirming the activation of the head. This message
        will include details such as the starting balance and UTxO entries.
        Notably, these entries will match exactly those committed to the head,
        including transaction hashes and indices, ensuring transparency and
        consistency.
      </p>

      <p>The head is now operational and ready for further activities.</p>
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  return (
    <>
      <InitHead provider={provider} providerName={providerName} />
      <CommitHead provider={provider} providerName={providerName} />
    </>
  );
}

function InitHead({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  async function runDemo() {
    await provider.init();
  }

  return (
    <LiveCodeDemo
      title="Init Head"
      subtitle="Initialize the Head with participants."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={false}
      runDemoProvider={providerName}
    />
  );
}

function CommitHead({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {

  const { wallet , connected } = useWallet();

  const [amount, setAmount] = useState<string>("10000000")

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();
    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
    
    provider;
  }

  return (
    <LiveCodeDemo
      title="Commit Head"
      subtitle="Commit UTXOs into the Head using the blueprint transaction."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={false}
      runDemoProvider={providerName}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect = {true}
    >
    <InputTable
       listInputs={[
        <Input
        value={amount}
        placeholder="Enter lovelace to commit"
        onChange={(e) => setAmount(e.target.value)}
        />
       ]}
    />
    </LiveCodeDemo>
  );
}
