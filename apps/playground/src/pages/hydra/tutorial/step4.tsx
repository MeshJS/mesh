import { useState } from "react";

import { MeshTxBuilder, MeshWallet } from "@meshsdk/core";
import { HydraProvider } from "@meshsdk/hydra";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
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
      sidebarTo="step4"
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

  buildTransactionCode += `const pp = await provider.fetchProtocolParameters();\n`;
  buildTransactionCode += `const utxos = await provider.fetchAddressUTxOs("address");\n`;

  buildTransactionCode += `const txBuilder = new MeshTxBuilder({\n`;
  buildTransactionCode += `  fetcher: provider,\n`;
  buildTransactionCode += `  submitter: provider,\n`;
  buildTransactionCode += `  isHydra: true,\n`;
  buildTransactionCode += `  params: pp,\n`;
  buildTransactionCode += `});\n\n`;

  buildTransactionCode += `const unsignedTx = await txBuilder\n`;
  buildTransactionCode += `  .txOut(\n`;
  buildTransactionCode += `    "bob-funds.addr",\n`;
  buildTransactionCode += `    [{ unit: "lovelace", quantity: "3000000" }]\n`;
  buildTransactionCode += `  )\n`;
  buildTransactionCode += `  .changeAddress("alice-funds.addr")\n`;
  buildTransactionCode += `  .selectUtxosFrom(utxos)\n`;
  buildTransactionCode += `  .setNetwork("preprod")\n`;
  buildTransactionCode += `  .complete();\n\n`;

  buildTransactionCode += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  buildTransactionCode += `const txHash = await provider.submitTx(signedTx);\n`;
  buildTransactionCode += `console.log(txHash);\n`;

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

      <h4>Fetch Address UTxOs</h4>
      <p>
        Alternatively, you can fetch Head UTxOs for a specific address:
        <Codeblock
          data={`const utxos = await provider.fetchAddressUTxOs("alice-funds.addr")`}
        />
      </p>
      <h4>Build and Submit Transaction</h4>
      <p>
        you can build transactions just like on layer 1 assuming you are sending
        from alice to bob:
      </p>
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
      <FetchAddressUtxosDemo provider={provider} providerName={providerName} />
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
      title="Fetch Hydra head UTxOs"
      subtitle="Fetching UTxOs from the Hydra head."
      runCodeFunction={runDemo}
      code={utxos}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
  );
}

function FetchAddressUtxosDemo({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  const [utxos, setUtxos] = useState("");
  const [address, setAddress] = useState("");

  const runDemo = async () => {
    await provider.connect();
    const utxos = await provider.fetchAddressUTxOs(address);
    setUtxos(JSON.stringify(utxos, null, 2));
  };

  return (
    <LiveCodeDemo
      title="Fetch hydra participant Address UTxOs"
      subtitle="Fetching UTxOs for a specific address."
      runCodeFunction={runDemo}
      code={utxos}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    >
      <InputTable
        listInputs={[
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="alice-funds.addr"
            label="Address"
          />,
        ]}
      />
    </LiveCodeDemo>
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
  const [key, setKey] = useState("");
  const [amount, setAmount] = useState(30000000);
  const [bobAddress, setBobAddress] = useState("");
  const [aliceAddress, setAliceAddress] = useState("");

  const runDemo = async () => {
    await provider.connect();
    const wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: "cli",
        payment: key,
      },
      fetcher: provider,
      submitter: provider,
    });

    const pp = await provider.fetchProtocolParameters();
    const utxos = await provider.fetchAddressUTxOs(aliceAddress);

    if (utxos === undefined) {
      return;
    }

    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      params: pp,
      verbose: true,
    });

    const unsignedTx = await txBuilder
      .txOut(bobAddress, [{ unit: "lovelace", quantity: amount.toString() }])
      .changeAddress(aliceAddress)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await provider.submitTx(signedTx);

    setTransaction(txHash);
  };

  return (
    <LiveCodeDemo
      title="Build and submit Transaction in Hydra head"
      subtitle="Build and submit a transaction in the Hydra head."
      runCodeFunction={runDemo}
      code={transaction}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    >
      <InputTable
        listInputs={[
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="alice-funds.sk"
            label="signing key"
          />,
          <Input
            value={aliceAddress}
            onChange={(e) => setAliceAddress(e.target.value)}
            placeholder="alice-funds.addr"
            label="Address"
          />,
          <Input
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="amount"
            label="amount (lovelace)"
          />,
          <Input
            value={bobAddress}
            onChange={(e) => setBobAddress(e.target.value)}
            placeholder="bob-funds.addr"
            label="bob-funds address"
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
