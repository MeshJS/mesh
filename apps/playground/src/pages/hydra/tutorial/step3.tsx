import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";
import { HydraInstance, HydraProvider } from "@meshsdk/hydra";
import { useWallet } from "@meshsdk/react";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder } from "~/pages/apis/txbuilder/common";

export default function HydraTutorialStep4({
  provider,
  providerName,
  instance,
}: {
  provider: HydraProvider;
  instance: HydraInstance;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step3"
      title="Step 3. Open a Hydra head"
      leftSection={Left()}
      rightSection={Right(provider, instance, providerName)}
    />
  );
}

function Left() {
  let commitFundsCode = ``;
  commitFundsCode += `import { HydraInstance , HydraProvider} from "@meshsdk/hydra";\n`;
  commitFundsCode += `\n`;
  commitFundsCode += `const provider = new HydraProvider({\n`;
  commitFundsCode += `  httpUrl: "<URL>",\n`;
  commitFundsCode += `});\n`;
  commitFundsCode += `const instance = new HydraInstance({\n`;
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
  commitFundsCode += `const commitTx = await instance.commitFunds(txHash, outputIndex);\n`;
  commitFundsCode += `const signedTx = await wallet.signTx(commitTx, true);\n`;
  commitFundsCode += `const commitTxHash = await wallet.submitTx(signedTx);\n`;
  commitFundsCode += `console.log('txHash: ',commitTxHash);\n`;

  let commitBlueprintCode = ``;
  commitBlueprintCode += `import { HydraInstance, HydraProvider } from "@meshsdk/hydra";\n`;
  commitBlueprintCode += `import { MeshWallet } from "@meshsdk/core";\n`;
  commitBlueprintCode += `\n`;
  commitBlueprintCode += `const provider = new HydraProvider({\n`;
  commitBlueprintCode += `  httpUrl: "<URL>",\n`;
  commitBlueprintCode += `});\n`;
  commitBlueprintCode += `\n`;
  commitBlueprintCode += `const instance = new HydraInstance({\n`;
  commitBlueprintCode += `  provider: provider,\n`;
  commitBlueprintCode += `  fetcher: "<blockchainProvider>",\n`;
  commitBlueprintCode += `  submitter: "<blockchainProvider>",\n`;
  commitBlueprintCode += `});\n`;
  commitBlueprintCode += `\n`;
  commitBlueprintCode += `const wallet = new MeshWallet({\n`;
  commitBlueprintCode += `  networkId: 0, // 0: testnet\n`;
  commitBlueprintCode += `  fetcher: "<blockchainProvider>",\n`;
  commitBlueprintCode += `  submitter: "<blockchainProvider>",\n`;
  commitBlueprintCode += `  key: {\n`;
  commitBlueprintCode += `    type: 'cli',\n`;
  commitBlueprintCode += `    payment: 'alice-funds.sk',\n`;
  commitBlueprintCode += `  },\n`;
  commitBlueprintCode += `});\n\n`;
  commitBlueprintCode += `const UTxOs = await wallet.getUtxos();\n`;
  commitBlueprintCode += `const address = await wallet.getChangeAddress();\n\n`;
  commitBlueprintCode += `const txBuilder = new MeshTxBuilder({\n`;
  commitBlueprintCode += `  fetcher: "<blockchainProvider>",\n`;
  commitBlueprintCode += `  submitter: "<blockchainProvider>",\n`;
  commitBlueprintCode += `});\n\n`;
  commitBlueprintCode += `const unsignedTx = await txBuilder\n`;
  commitBlueprintCode += `  .txIn(txHash, outputIndex)\n`;
  commitBlueprintCode += `  .txOut(address, [{ unit: "lovelace", quantity: amount }])\n`;
  commitBlueprintCode += `  .setFee("0")\n`;
  commitBlueprintCode += `  .changeAddress(address)\n`;
  commitBlueprintCode += `  .selectUtxosFrom(UTxOs)\n`;
  commitBlueprintCode += `  .complete();\n`;
  commitBlueprintCode += `\n`;
  commitBlueprintCode += `const commitTx = await instance.commitBlueprint(txHash, outputIndex, {\n`;
  commitBlueprintCode += `  type: "Tx ConwayEra",\n`;
  commitBlueprintCode += `  cborHex: unsignedTx,\n`;
  commitBlueprintCode += `  description: "Commit Blueprint transaction",\n`;
  commitBlueprintCode += `});\n`;
  commitBlueprintCode += `\n`;
  commitBlueprintCode += `const signedTx = await wallet.signTx(commitTx, true);\n`;
  commitBlueprintCode += `const commitBlueprintTxHash = await wallet.submitTx(signedTx);\n`;
  commitBlueprintCode += `\n`;
  commitBlueprintCode += `console.log('txHash:',commitBlueprintTxHash);\n`;

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
        head. You can either use the <code>commitFunds</code> or{" "}
        <code>commitBlueprint</code>function on <code>HydraInstance</code> by
        selecting specific UTxOs and make them available for layer 2
        transactions:
      </p>
      <Codeblock data={commitFundsCode} />
      <p>
        <code>commitBlueprint</code>
        To commit using blueprint you can specify UTxOs to commit just like{" "}
        <code>commitFunds</code> but it takes additional parameter. A Cardano
        transaction in the text envelope format used as type{" "}
        <code>hydraTransaction</code> in Mesh That is, a JSON object wrapper
        with some 'type' around a 'cborHex' encoded transaction. The hydra-node
        uses this format as follows:
      </p>
      <ul>
        <li>
          <code>type</code>: This can either be <code>Tx ConwayEra</code>,{" "}
          <code>Unwitnessed Tx ConwayEra</code> or{" "}
          <code>Witnessed Tx ConwayEra</code>
        </li>
        <li>
          <code>cborhex:</code> The base16-encoding of the CBOR encoding of some
          binary data, this can be passed from a built unsigned transaction
        </li>
        <li>
          <code>description: </code> An optional description for the transaction
        </li>
      </ul>
      <Codeblock data={commitBlueprintCode} />
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
      <h4>Hydra head status</h4>
      <p>
        <Codeblock
          data={`await provider.onStatusChange((status) => { console.log(status); });`}
        />
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
  instance: HydraInstance,
  providerName: string,
) {
  return (
    <>
      <ConnectDemo provider={provider} providerName={providerName} />
      <InitializeHeadDemo provider={provider} providerName={providerName} />
      <CommitFundsDemo
        provider={provider}
        instance={instance}
        providerName={providerName}
      />
      <CommitBlueprintDemo
        provider={provider}
        instance={instance}
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
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
      runCodeFunction={runDemo}
    />
  );
}

function CommitFundsDemo({
  provider,
  instance,
  providerName,
}: {
  provider: HydraProvider;
  instance: HydraInstance;
  providerName: string;
}) {
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
      return;
    }

    const commitTx = await instance.commitFunds(txHash, outputIndex);
    const signedTx = await wallet.signTx(commitTx, true);
    const commitTxHash = await wallet.submitTx(signedTx);
    return `commit txHash: ${commitTxHash}`;
  };

  return (
    <LiveCodeDemo
      title="Commit Funds"
      subtitle="commits funds to Hydra head."
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
      runCodeFunction={runDemo}
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

function CommitBlueprintDemo({
  provider,
  instance,
  providerName,
}: {
  provider: HydraProvider;
  instance: HydraInstance;
  providerName: string;
}) {
  const [commitBlueprintStatus, setCommitBlueprintStatus] = useState("");
  const [txHash, setTxHash] = useState<string>("");
  const [outputIndex, setOutputIndex] = useState<number | null>(null);
  const { wallet } = useWallet();

  const runDemo = async () => {
    await provider.connect();
    if (txHash === "" || outputIndex === null) {
      setCommitBlueprintStatus("Enter a valid txHash or output index");
      return;
    }

    const UTxOs = await wallet.getUtxos();
    const address = await wallet.getChangeAddress();
    const amount =
      UTxOs[0]?.output.amount.find((a) => a.unit === "lovelace")?.quantity ??
      "0";
    const txBuilder = getTxBuilder();

    const unsignedTx = await txBuilder
      .txIn(txHash, outputIndex)
      .txOut(address, [{ unit: "lovelace", quantity: amount }])
      .setFee("0")
      .changeAddress(address)
      .selectUtxosFrom(UTxOs)
      .complete();

    const commitTx = await instance.commitBlueprint(txHash, outputIndex, {
      type: "Tx ConwayEra",
      cborHex: unsignedTx,
      description: "Commit Blueprint",
    });

    const signedTx = await wallet.signTx(commitTx);
    const commitTxHash = await wallet.submitTx(signedTx);
    console.log(commitTxHash);
    return `commitTxHash: ${commitTxHash}`;
  };

  return (
    <LiveCodeDemo
      title="Commit UTxO Blueprint"
      subtitle="commits a blueprint to Hydra head."
      code={commitBlueprintStatus}
      runDemoShowBrowseWalletConnect={true}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
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
