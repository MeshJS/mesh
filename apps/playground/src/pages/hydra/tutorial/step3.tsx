import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";
import { HydraInstance, HydraProvider } from "@meshsdk/hydra";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep4({
  provider,
  providerName,
  hInstance,
}: {
  provider: HydraProvider;
  providerName: string;
  hInstance: HydraInstance;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step3"
      title="Step 3. Open a Hydra head"
      leftSection={Left()}
      rightSection={Right(provider, hInstance, providerName)}
    />
  );
}

function Left() {
  let commitFundsCode = ``;
  commitFundsCode += `import { HydraInstance , HydraProvider} from "@meshsdk/hydra";\n`;
  commitFundsCode += `\n`;
  commitFundsCode += `const provider = new HydraProvider({\n`;
  commitFundsCode += `  url: "<URL>",\n`;
  commitFundsCode += `});\n`;
  commitFundsCode += `const hInstance = new HydraInstance({\n`;
  commitFundsCode += `  provider: provider,\n`;
  commitFundsCode += `  fetcher: "<blockchainProvider>",\n`;
  commitFundsCode += `  submitter: "<blockchainProvider>",\n`;
  commitFundsCode += `});\n`;
  commitFundsCode += `\n`;
  commitFundsCode += `const wallet = new MeshWallet({\n`;
  commitFundsCode += `  networkId: 0, // 0: testnet\n`;
  commitFundsCode += `  fetcher: "<blockchainProvider>",\n`;
  commitFundsCode += `  submitter: "<blockchainProvider>",\n`;
  commitFundsCode += `  key: {\n`;
  commitFundsCode += `    type: 'cli',\n`;
  commitFundsCode += `    payment: 'alice-funds.sk',\n`;
  commitFundsCode += `  },\n`;
  commitFundsCode += `});\n\n`;

  commitFundsCode += `const outputIndex = 0;\n`;
  commitFundsCode += `const txHash = "00000000000000000000000000000000000000000000000000000000000000000";\n\n`;
  commitFundsCode += `const commitTx = await hInstance.commitFunds(txHash, outputIndex);\n`;
  commitFundsCode += `const signedTx = await wallet.signTx(commitTx, true);\n`;
  commitFundsCode += `const commitTxHash = await wallet.submitTx(signedTx);\n`;
  commitFundsCode += `console.log(commitTxHash);\n`;

  return (
    <>
      <h4>Connect to the Hydra head</h4>
      <p>
        Now that both Hydra nodes are running and connected, we can start using
        the head API url and port together with Mesh <code>HydraProvider</code>{" "}
        in connecting to the Hydra head.
      </p>
      <Codeblock data={"await provider.connect();"} />

      <h4>Initialize the Head</h4>
      <p>Send the initialization command to start the Hydra head:</p>
      <Codeblock data={"await provider.init();"} />

      <h4>Commit Funds</h4>
      <p>
        After initialization, both participants need to commit funds to the
        head. In this tutorial we use the <code>commitFunds</code> function on{" "}
        <code>HydraInstance</code> by selecting specific UTxOs and make them
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

      <h4>Hydra Head Status Flow</h4>
      <p>The head goes through these status changes:</p>
      <ul>
        <li>
          <code>HeadIsInitializing</code> - Head is being initialized
        </li>
        <li>
          <code>Committed</code> - Funds are committed to the head
        </li>
        <li>
          <code>HeadIsOpen</code> - Head is open and ready for transactions
        </li>
      </ul>
    </>
  );
}

function Right(
  provider: HydraProvider,
  hInstance: HydraInstance,
  providerName: string,
) {
  return (
    <>
      <ConnectDemo provider={provider} providerName={providerName} />
      <InitializeHeadDemo provider={provider} providerName={providerName} />
      <CommitFundsDemo
        provider={provider}
        hInstance={hInstance}
        providerName={providerName}
      />
      <MonitorHeadStatusDemo provider={provider} providerName={providerName} />
    </>
  );
}

function ConnectDemo({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  const [connectStatus, setConnectStatus] = useState("");
  const runDemo = async () => {
    setConnectStatus(JSON.stringify(await provider.connect(), null, 2));
  };

  return (
    <LiveCodeDemo
      title="Connect to Hydra Node"
      subtitle={`Connect your to the Hydra node.`}
      code={connectStatus}
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
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
    await provider.connect();
    await provider.init();
    setInitStatus(JSON.stringify(await provider.init(), null, 2));
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

function CommitFundsDemo({
  provider,
  hInstance,
  providerName,
}: {
  provider: HydraProvider;
  hInstance: HydraInstance;
  providerName: string;
}) {
  const [commitStatus, setCommitStatus] = useState("");
  const [txHash, setTxHash] = useState<string>("");
  const [outputIndex, setOutputIndex] = useState<number | null>(null);
  const [key, setKey] = useState<string>("");

  const runDemo = async () => {
    await provider.connect();
    const blockchainProvider = getProvider();

    const wallet = new MeshWallet({
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      networkId: 0,
      key: {
        type: "cli",
        payment: key,
      },
    });

    if (txHash === "" || outputIndex === null) {
      setCommitStatus("Enter a valid txHash or output index");
      return;
    }

    const commitTx = await hInstance.commitFunds(txHash, outputIndex);
    const signedTx = await wallet.signTx(commitTx, true);
    const commitTxHash = await wallet.submitTx(signedTx);
    setCommitStatus(`commit txHash: ${commitTxHash}`);
  };

  return (
    <LiveCodeDemo
      title="Commit Funds"
      subtitle="commits funds to Hydra head."
      runCodeFunction={runDemo}
      code={commitStatus}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    >
      <InputTable
        listInputs={[
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Funds.sk"
            label="funds signing key"
          />,
          <Input
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="txHash"
            label="Tx Hash"
          />,
          <Input
            value={outputIndex ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              setOutputIndex(val === "" ? null : Number(val));
            }}
            placeholder="outputIndex"
            label="Output Index"
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
    await provider.connect();
    setHeadStatus(
      JSON.stringify(
        await provider.onStatusChange((status) => {
          console.log(status);
        }),
        null,
        2,
      ),
    );
  };

  return (
    <LiveCodeDemo
      title="Head Status"
      subtitle="Monitor the Hydra head status changes."
      code={headStatus}
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    />
  );
}
