import { useState } from "react";

import { MeshTxBuilder, MeshWallet } from "@meshsdk/core";
import { HydraInstance, HydraProvider } from "@meshsdk/hydra";

import Button from "~/components/button/button";
import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Alert from "~/components/text/alert";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep5({
  hydraInstance,
  aliceNode,
  aliceFunds,
  bobNode,
  bobFunds,
}: {
  hydraInstance: HydraInstance;
  aliceNode: MeshWallet | undefined;
  aliceFunds: MeshWallet | undefined;
  bobNode: MeshWallet | undefined;
  bobFunds: MeshWallet | undefined;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step5"
      title="Step 5. Use the Hydra head"
      leftSection={Left()}
      rightSection={Right({
        hydraInstance,
        aliceNode,
        aliceFunds,
        bobNode,
        bobFunds,
      })}
    />
  );
}

function Left() {
  const fetchUtxosCode = `// Fetch all UTxOs in the Hydra head
const utxos = await hydraInstance.provider.fetchUTxOs();
console.log("Available UTxOs:", utxos);

// Fetch UTxOs for a specific address
const addressUtxos = await hydraInstance.provider.fetchAddressUTxOs(
  "addr_test1vpd5axpq4qsh8sxvzny49cp22gc5tqx0djf6wmjv5cx7q5qyrzuw8"
);
console.log("Address UTxOs:", addressUtxos);`;

  const buildTransactionCode = `// Build a transaction in the Hydra head
const wallet = new MeshWallet({
  networkId: 0,
  key: {
    type: "cli",
    payment: "your-payment-key",
  },
  fetcher: hydraInstance.provider,
  submitter: hydraInstance.provider,
});

const pp = await hydraInstance.provider.fetchProtocolParameters();
const utxos = await wallet.getUtxos("enterprise");
const changeAddress = "your-change-address";

const txBuilder = new MeshTxBuilder({
  fetcher: hydraInstance.provider,
  params: pp,
  verbose: true,
});

const unsignedTx = await txBuilder
  .txOut(
    "recipient-address",
    [{ unit: "lovelace", quantity: "3000000" }]
  )
  .changeAddress(changeAddress)
  .selectUtxosFrom(utxos)
  .complete();`;

  const submitTransactionCode = `// Sign and submit the transaction
const signedTx = await wallet.signTx(unsignedTx);
const txHash = await hydraInstance.provider.submitTx(signedTx);
console.log("Transaction submitted:", txHash);

// Monitor transaction status
hydraInstance.provider.onMessage((message) => {
  if (message.tag === "TxValid") {
    console.log("Transaction validated!");
  } else if (message.tag === "TxInvalid") {
    console.log("Transaction invalid:", message.validationError);
  }
});`;

  return (
    <>
      <p>
        Now that the Hydra head is open, you can perform transactions within the
        layer 2 state channel. Hydra Head operates as an isomorphic protocol,
        meaning that functionalities available on Cardano layer 1 are also
        available on layer 2. This allows us to use Mesh SDK for transaction
        creation within the head.
      </p>

      <h4>Fetch UTxOs</h4>
      <p>
        First, let's see what UTxOs are available in the Hydra head:
      </p>
      <Codeblock data={fetchUtxosCode} />

      <Alert>
        <strong>Note:</strong> The UTxOs in the Hydra head are the ones that
        were committed by both participants during the initialization phase.
      </Alert>

      <h3>Build a Transaction</h3>
      <p>
        Using Mesh SDK, you can build transactions just like on layer 1:
      </p>
      <Codeblock data={buildTransactionCode} />

      <h3>Submit the Transaction</h3>
      <p>
        Sign and submit the transaction to the Hydra head:
      </p>
      <Codeblock data={submitTransactionCode} />

      <p>
        The transaction will be validated by both hydra-nodes and either result
        in a <code>TxValid</code> message or a <code>TxInvalid</code> message
        with a reason. If valid, you'll see a <code>SnapshotConfirmed</code>
        message shortly after with the new UTxO set.
      </p>

      <h3>Transaction Flow</h3>
      <p>The transaction goes through these steps:</p>
      <ul>
        <li><code>NewTx</code> - Transaction submitted to head</li>
        <li><code>TxValid</code> - Transaction validated by all nodes</li>
        <li><code>SnapshotConfirmed</code> - New state confirmed</li>
      </ul>

      <p>
        Congratulations! You just processed your first Cardano transaction
        off-chain in a Hydra head!
      </p>
    </>
  );
}

function Right({

}) {
  return (
    <>
      <FetchUtxosDemo />
      <BuildTransactionDemo />
      <SubmitTransactionDemo />
    </>
  );
}

function FetchUtxosDemo() {
  const [utxos, setUtxos] = useState("");

  const runDemo = async () => {
      };

  return (
    <LiveCodeDemo
      title="Fetch UTxOs"
      subtitle="Simulates fetching UTxOs from the Hydra head."
      runCodeFunction={runDemo}
      code={utxos}
    />
  );
}

function BuildTransactionDemo() {
  const [transaction, setTransaction] = useState("");

  const runDemo = async () => {
      };

  return (
    <LiveCodeDemo
      title="Build Transaction"
      subtitle="Simulates building a transaction in the Hydra head."
      runCodeFunction={runDemo}
      code={transaction}
    />
  );
}

function SubmitTransactionDemo() {
  const [txStatus, setTxStatus] = useState("");

  const runDemo = async () => {

  };

  return (
    <LiveCodeDemo
      title="Submit Transaction"
      subtitle="Simulates submitting and monitoring a transaction in the Hydra head."
      runCodeFunction={runDemo}
      code={txStatus}
    />
  );
}
