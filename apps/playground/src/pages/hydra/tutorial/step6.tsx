import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";
import { HydraInstance } from "@meshsdk/hydra";

import Button from "~/components/button/button";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Alert from "~/components/text/alert";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep6({
}: {
  aliceNode: MeshWallet | undefined;
  aliceFunds: MeshWallet | undefined;
  bobNode: MeshWallet | undefined;
  bobFunds: MeshWallet | undefined;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step6"
      title="Step 6. Close the Hydra head"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  const closeHeadCode = `// Close the Hydra head
await hydraInstance.provider.close();

// Monitor the closing process
hydraInstance.provider.onStatusChange((status) => {
  console.log("Head status:", status);
  
  switch (status) {
    case "CLOSED":
      console.log("Head is closed, contestation period begins");
      break;
    case "FANOUT_POSSIBLE":
      console.log("Ready to fanout - contestation period ended");
      break;
    case "FINAL":
      console.log("Head is finalized on layer 1");
      break;
  }
});`;

  const fanoutCode = `// Fanout the head to distribute funds on layer 1
await hydraInstance.provider.fanout();

// Monitor the fanout process
hydraInstance.provider.onMessage((message) => {
  if (message.tag === "HeadIsFinalized") {
    console.log("Head finalized with distributed UTxOs:", message.utxo);
  }
});`;

  const checkFundsCode = `// Check final balances on layer 1
const aliceBalance = await aliceFunds.getBalance();
const bobBalance = await bobFunds.getBalance();

console.log("Alice's final balance:", aliceBalance);
console.log("Bob's final balance:", bobBalance);`;

  return (
    <>
      <p>
        When you're done with the Hydra head, you can close it to return all
        funds to layer 1. This process involves closing the head, waiting for
        the contestation period, and then fanning out the final state.
      </p>

      <h3>Close the Head</h3>
      <p>
        Any participant can initiate closing the Hydra head:
      </p>
      <Codeblock data={closeHeadCode} />

      <Alert>
        <strong>Important:</strong> Once closed, no more transactions can be
        submitted to the head. The head enters a contestation period where
        participants can challenge the closing snapshot.
      </Alert>

      <h3>Contestation Period</h3>
      <p>
        After closing, there's a contestation period (configurable with{" "}
        <code>--contestation-period</code>). During this time:
      </p>
      <ul>
        <li>Participants can contest the closing snapshot</li>
        <li>If contested, a more recent snapshot can be used</li>
        <li>After the deadline, fanout becomes possible</li>
      </ul>

      <h3>Fanout the Head</h3>
      <p>
        Once the contestation period ends, you can fanout to distribute the
        final state back to layer 1:
      </p>
      <Codeblock data={fanoutCode} />

      <h3>Check Final Balances</h3>
      <p>
        After fanout, check the final balances on layer 1:
      </p>
      <Codeblock data={checkFundsCode} />

      <h3>Head Lifecycle</h3>
      <p>The complete head lifecycle:</p>
      <ul>
        <li><code>IDLE</code> - Initial state</li>
        <li><code>INITIALIZING</code> - Head being initialized</li>
        <li><code>OPEN</code> - Head open for transactions</li>
        <li><code>CLOSED</code> - Head closed, contestation period</li>
        <li><code>FANOUT_POSSIBLE</code> - Ready to fanout</li>
        <li><code>FINAL</code> - Head finalized on layer 1</li>
      </ul>

      <p>
        Congratulations! You've completed the full lifecycle of a Hydra head
        from initialization to finalization.
      </p>
    </>
  );
}

function Right() {
  return (
    <>
      <CloseHeadDemo />
      <ContestationDemo />
      <FanoutDemo />
    </>
  );
}

function CloseHeadDemo() {
  const [closeStatus, setCloseStatus] = useState("");

  const runDemo = async () => {
    
  };

  return (
    <LiveCodeDemo
      title="Close Head"
      subtitle="Simulates closing the Hydra head."
      runCodeFunction={runDemo}
      code={closeStatus}
    />
  );
}

function ContestationDemo() {
  const [contestationStatus, setContestationStatus] = useState("");

  const runDemo = async () => {
  };

  return (
    <LiveCodeDemo
      title="Contestation Period"
      subtitle="Simulates the contestation period after closing."
      runCodeFunction={runDemo}
      code={contestationStatus}
    />
  );
}

function FanoutDemo() {
  const [fanoutStatus, setFanoutStatus] = useState("");

  const runDemo = async () => {
    
  };

  return (
    <LiveCodeDemo
      title="Fanout Head"
      subtitle="Simulates fanning out the Hydra head to layer 1."
      runCodeFunction={runDemo}
      code={fanoutStatus}
    />
  );
}
