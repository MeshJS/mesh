import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";
import { HydraInstance, HydraProvider } from "@meshsdk/hydra";

import Button from "~/components/button/button";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Alert from "~/components/text/alert";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep6({provider, providerName}:{
  provider: HydraProvider, 
  providerName: string
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step6"
      title="Step 5. Close the Hydra head"
      leftSection={Left()}
      rightSection={Right(provider,providerName)}
    />
  );
}

function Left() {

  const fanoutCode = `// Fanout the head to distribute funds on layer 1
await hydraInstance.provider.fanout();

provider.onMessage((message) => {
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

      <h4>Close the Head</h4>
      <p>Any participant can initiate closing the Hydra head, Once closed, no more transactions can be
        submitted to the head. The head enters a contestation period where
        participants can challenge the closing snapshot.</p>
      <Codeblock data={"await provider.close()"} />


      <h4>Contestation Period</h4>
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
      <Codeblock data={"await provider.fanout()"} />

      <h3>Check Final Balances</h3>
      <p>After fanout, check the final balances on layer 1:</p>
      <Codeblock data={checkFundsCode} />

      <h3>Head Lifecycle</h3>
      <p>The complete head lifecycle:</p>
      <ul>
        <li>
          <code>IDLE</code> - Initial state
        </li>
        <li>
          <code>INITIALIZING</code> - Head being initialized
        </li>
        <li>
          <code>OPEN</code> - Head open for transactions
        </li>
        <li>
          <code>CLOSED</code> - Head closed, contestation period
        </li>
        <li>
          <code>FANOUT_POSSIBLE</code> - Ready to fanout
        </li>
        <li>
          <code>FINAL</code> - Head finalized on layer 1
        </li>
      </ul>

      <p>
        Congratulations! You've completed the full lifecycle of a Hydra head
        from initialization to finalization.
      </p>
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  return (
    <>
      <CloseHeadDemo provider={provider} 
      providerName={providerName} />
      <FanoutDemo provider={provider}
      providerName={providerName} />
    </>
  );
}

function CloseHeadDemo({provider, providerName}: {provider: HydraProvider, providerName: string}) {
  const [closeStatus, setCloseStatus] = useState<string | void>("");

  const runDemo = async () => {
    await provider.close();
    setCloseStatus(await provider.onStatusChange((status) => console.log(status)));
  };

  return (
    <LiveCodeDemo
      title="Close Head"
      subtitle="Simulates closing the Hydra head."
      runCodeFunction={runDemo}
      //code={closeStatus}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
  );
}

function FanoutDemo({provider, providerName}: {provider: HydraProvider, providerName: string}) {
  const [fanoutStatus, setFanoutStatus] = useState("");

  const runDemo = async () => {
    await provider.fanout();
  };

  return (
    <LiveCodeDemo
      title="Fanout Head"
      subtitle="Simulates fanning out the Hydra head to layer 1."
      runCodeFunction={runDemo}
      code={fanoutStatus}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
  );
}
