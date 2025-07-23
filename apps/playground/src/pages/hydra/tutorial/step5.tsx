import { useState } from "react";

import { HydraProvider } from "@meshsdk/hydra";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep6({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step6"
      title="Step 5. Close the Hydra head"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  let codeSnippet = `// Check final balances on layer 1\n`;
  codeSnippet += `const aliceFundsBalance = await provider.fetchAddressUTxOs("alice-funds-address");\n`;
  codeSnippet += `const aliceNodeBalance = await provider.fetchAddressUTxOs("alice-node-address");\n\n`;
  codeSnippet += `const bobFundsBalance = await provider.fetchAddressUTxOs("bob-funds-address");\n`;
  codeSnippet += `const bobNodeBalance = await provider.fetchAddressUTxOs("bob-node-address");\n`;

  return (
    <>
      <p>
        You can close the head to return head utxos to layer 1. This process
        involves closing the head, waiting for the contestation period, and then
        fan out the final state.
      </p>

      <h4>Close the Head</h4>
      <p>
        Any participant can initiate closing the Hydra head. Once closed, no
        more transactions can be submitted to the head. The head enters a
        contestation period where participants can challenge the closing
        snapshot. After the contestation period, the head participants can use
        the <code>fanout</code> to fully close the <code>hydra-head</code> and
        return the head utxos to layer 1.
      </p>
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

      <h4>Fanout the Head</h4>
      <p>
        Once the contestation period ends, you can fanout to distribute the
        final state back to layer 1:
      </p>
      <Codeblock data={"await provider.fanout()"} />

      <h4>Check Final Balances</h4>
      <p>After fanout, check the final balances on layer 1:</p>
      <Codeblock data={codeSnippet} />

      <h4>Head Lifecycle</h4>
      <p>The complete head lifecycle:</p>
      <ul>
        <li>
          <code>INITIALIZE</code> - Initial state
        </li>
        <li>
          <code>COMMIT</code> - Committing to Hydra head
        </li>
        <li>
          <code>OPEN</code> - Head open for transactions
        </li>
        <li>
          <code>NEW TX</code> - New transaction submitted in Hydra head
        </li>
        <li>
          <code>CLOSE</code> - Ready to fanout
        </li>
        <li>
          <code>CONTEST</code> - Head closed, contestation period
        </li>
        <li>
          <code>FANOUT</code> - Head finalized on layer 1
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
      <CloseHeadDemo provider={provider} providerName={providerName} />
      <FanoutDemo provider={provider} providerName={providerName} />
    </>
  );
}

function CloseHeadDemo({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  const [closeStatus, setCloseStatus] = useState<string>("");

  const runDemo = async () => {
    await provider.connect();
    setCloseStatus(JSON.stringify(await provider.close(), null, 2));
  };

  return (
    <LiveCodeDemo
      title="Close Head"
      subtitle="closing the Hydra head."
      runCodeFunction={runDemo}
      code={closeStatus}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
  );
}

function FanoutDemo({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  const [fanoutStatus, setFanoutStatus] = useState<string>("");
  const runDemo = async () => {
    await provider.connect();
    setFanoutStatus(JSON.stringify(await provider.fanout(), null, 2));
  };

  return (
    <LiveCodeDemo
      title="Fanout Head"
      subtitle="fan out the Hydra head to layer 1."
      runCodeFunction={runDemo}
      code={fanoutStatus}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
  );
}
