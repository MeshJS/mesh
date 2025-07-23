import { useState } from "react";

import { MeshTxBuilder, MeshWallet } from "@meshsdk/core";
import { HydraProvider } from "@meshsdk/hydra";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep5({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step5"
      title="Step 4. Use the Hydra head"
      leftSection={Left()}
      rightSection={Right({
        provider,
        providerName,
      })}
    />
  );
}

function Left() {
  let buildTransactionCode = ``;
  buildTransactionCode += `const wallet = new MeshWallet({\n`;
  buildTransactionCode += `  networkId: 0,\n`;
  buildTransactionCode += `  key: {\n`;
  buildTransactionCode += `    type: "cli",\n`;
  buildTransactionCode += `    payment: "cli-signing-key",\n`;
  buildTransactionCode += `  },\n`;
  buildTransactionCode += `  fetcher: "<blockchainprovider>",\n`;
  buildTransactionCode += `  submitter: "<blockchainprovider>",\n`;
  buildTransactionCode += `});\n\n`;

  buildTransactionCode += `const pp = await provider.fetchProtocolParameters();\n`;
  buildTransactionCode += `const utxos = await wallet.getUtxos("enterprise");\n`;
  buildTransactionCode += `const changeAddress = await wallet.getChangeAddress();\n\n`;

  buildTransactionCode += `const txBuilder = new MeshTxBuilder({\n`;
  buildTransactionCode += `  fetcher: "provider",\n`;
  buildTransactionCode += `  submitter: "provider",\n`;
  buildTransactionCode += `  params: pp,\n`;
  buildTransactionCode += `  verbose: true,\n`;
  buildTransactionCode += `});\n\n`;

  buildTransactionCode += `const unsignedTx = await txBuilder\n`;
  buildTransactionCode += `  .txOut(\n`;
  buildTransactionCode += `    "recipient-address",\n`;
  buildTransactionCode += `    [{ unit: "lovelace", quantity: "3000000" }]\n`;
  buildTransactionCode += `  )\n`;
  buildTransactionCode += `  .changeAddress(changeAddress)\n`;
  buildTransactionCode += `  .selectUtxosFrom(utxos)\n`;
  buildTransactionCode += `  .setNetwork("preprod")\n`;
  buildTransactionCode += `  .complete();\n`;

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
      <p>First, let's see what UTxOs are available in the Hydra head:</p>
      <Codeblock data={"const utxos = await provider.fetchUTxOs();"} />

      <h4>Build and Submit Transaction</h4>
      <p>you can build transactions just like on layer 1:</p>
      <Codeblock data={buildTransactionCode} />

      <p>
        The transaction will be validated by both hydra-nodes and either result
        in a <code>TxValid</code> message or a <code>TxInvalid</code> message If
        valid, you'll see a <code>SnapshotConfirmed</code>
        message shortly after with the new UTxO set.
      </p>

      <h3>Transaction Flow</h3>
      <p>The transaction goes through these steps:</p>
      <ul>
        <li>
          <code>NewTx</code> - Transaction submitted to head
        </li>
        <li>
          <code>TxValid</code> - Transaction validated by all nodes
        </li>
        <li>
          <code>SnapshotConfirmed</code> - New state confirmed
        </li>
      </ul>

      <p>
        Congratulations! You just processed your first Cardano transaction
        off-chain in a Hydra head!
      </p>
    </>
  );
}

function Right({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <>
      <FetchUtxosDemo provider={provider} providerName={providerName} />
      <BuildTransactionDemo provider={provider} providerName={providerName} />
    </>
  );
}

function FetchUtxosDemo({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  const [utxos, setUtxos] = useState("");

  const runDemo = async () => {
    const utxos = await provider.fetchUTxOs();
    setUtxos(JSON.stringify(utxos, null, 2));
  };

  return (
    <LiveCodeDemo
      title="Fetch UTxOs"
      subtitle="Fetching UTxOs from the Hydra head."
      runCodeFunction={runDemo}
      code={utxos}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
  );
}

function BuildTransactionDemo({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  const [transaction, setTransaction] = useState("");

  const runDemo = async () => {
    const wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: "cli",
        payment: "your-payment-key",
      },
      fetcher: provider,
      submitter: provider,
    });

    const pp = await provider.fetchProtocolParameters();
    const utxos = await wallet.getUtxos("enterprise");
    const changeAddress = "your-change-address";

    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      params: pp,
      verbose: true,
    });

    const unsignedTx = await txBuilder
      .txOut("recipient-address", [{ unit: "lovelace", quantity: "3000000" }])
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    setTransaction(unsignedTx);
  };

  return (
    <LiveCodeDemo
      title="Build and submit Transaction"
      subtitle="Building and submitting a transaction in the Hydra head."
      runCodeFunction={runDemo}
      code={transaction}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
  );
}
