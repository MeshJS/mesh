import { useState } from "react";

import { HydraInstance, HydraProvider } from "@meshsdk/hydra";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep4({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step4"
      title="Step 4. Open a Hydra head"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  const commitFundsCode = `// Commit funds to the head
const txHash = "your-utxo-tx-hash";
const txIndex = 0;

const commitTx = await hydraInstance.commitFunds(txHash, txIndex);
console.log("Commit transaction:", commitTx);

// Sign and submit the transaction
// This would be done with your wallet or CLI tools`;

  return (
    <>
      <p>
        Now that both Hydra nodes are running and connected, we can initialize a
        Hydra head. This creates a layer 2 state channel between the
        participants.
      </p>

      <h4>Initialize the Head</h4>
      <p>Send the initialization command to start the Hydra head:</p>
      <Codeblock data={"await provider.init();"} />

      <h4>Commit Funds</h4>
      <p>
        After initialization, both participants need to commit funds to the
        head. In this tutorial we use the <code>commitBlueprint</code> function
        on <code>HydraInstance</code> by seleting specific UTxOs and make them
        available for layer 2 transactions:
      </p>
      <Codeblock data={commitFundsCode} />

      <p>
        The hydra-node will create a draft commit transaction for you to sign.
        Once signed and submitted to the Cardano network, you'll see a{" "}
        <code>Committed</code> message in your WebSocket connection.
      </p>

      <p>
        When both parties have committed their funds, the Hydra head will open
        automatically. You'll see a <code>HeadIsOpen</code> message confirming
        the head is operational and ready for transactions.
      </p>

      <h4>Head Status Flow</h4>
      <p>The head goes through these status changes:</p>
      <ul>
        <li>
          <code>IDLE</code> - Initial state
        </li>
        <li>
          <code>INITIALIZING</code> - Head is being initialized
        </li>
        <li>
          <code>OPEN</code> - Head is open and ready for transactions
        </li>
      </ul>
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  return (
    <>
      <InitializeHeadDemo provider={provider} providerName={providerName} />
      <CommitFundsDemo />
      <MonitorHeadStatusDemo provider={provider} providerName={providerName} />
    </>
  );
}

function InitializeHeadDemo({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  const [initStatus, setInitStatus] = useState("");

  const runDemo = async () => {
    await provider.init();
  };

  return (
    <LiveCodeDemo
      title="Initialize Head"
      subtitle="initializing the Hydra head."
      code={initStatus}
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
  );
}

function CommitFundsDemo() {
  const [commitStatus, setCommitStatus] = useState("");
  const [amount, setAmount] = useState<string>("10000000");
  const runDemo = async () => {};

  return (
    <LiveCodeDemo
      title="Commit Funds"
      subtitle="commits funds using blueprintTx from wallet."
      runCodeFunction={runDemo}
      runDemoShowBrowseWalletConnect={true}
      code={commitStatus}
    >
      <InputTable
        listInputs={[
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="lovelace"
            label="Amount"
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}

function MonitorHeadStatusDemo({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  const [headStatus, setHeadStatus] = useState("");

  const runDemo = async () => {
    await provider.onStatusChange((status) => {
      console.log(status);
    });
  };

  return (
    <LiveCodeDemo
      title="Monitor Head Status"
      subtitle="Simulates monitoring the Hydra head status changes."
      code={headStatus}
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
  );
}
