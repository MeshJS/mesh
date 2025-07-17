import { useState } from "react";
import { MeshWallet } from "@meshsdk/core";
import { HydraProvider } from "@meshsdk/hydra";

import Button from "~/components/button/button";
import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import LiveCodeDemo from "~/components/sections/live-code-demo";

export default function HydraTutorialStep2({
  provider,
  providerName
}: {
  aliceNode: MeshWallet | undefined;
  aliceFunds: MeshWallet | undefined;
  bobNode: MeshWallet | undefined;
  bobFunds: MeshWallet | undefined;
  provider: HydraProvider;
  providerName: string
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step2"
      title="Step 2. Start the Hydra node"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left(
) {
  const [loading, setLoading] = useState<boolean>(false);

  async function startNode() {

  }
  let codeHydraStartNode = ``;
  codeHydraStartNode += `hydra_version= 0.22.0\n`;
  codeHydraStartNode += `hydra-node \\\n`;
  codeHydraStartNode += `  --node-id alice-node \\\n`;
  codeHydraStartNode += `  --persistence-dir persistence-alice \\\n`;
  codeHydraStartNode += `  --cardano-signing-key credentials/alice-node.sk \\\n`;
  codeHydraStartNode += `  --hydra-signing-key credentials/alice-hydra.sk \\\n`;
  codeHydraStartNode += '  --hydra-scripts-tx-id $(curl https://raw.githubusercontent.com/cardano-scaling/hydra/master/hydra-node/networks.json | jq -r ".preprod.\\"${hydra_version}\\"") \n';
  codeHydraStartNode += `  --ledger-protocol-parameters protocol-parameters.json \\\n`;
  codeHydraStartNode += `  --testnet-magic 1 \\\n`;
  codeHydraStartNode += `  --node-socket node.socket \\\n`;
  codeHydraStartNode += `  --api-port 4001 \\\n`;
  codeHydraStartNode += `  --listen 0.0.0.0:5001 \\\n`;
  codeHydraStartNode += `  --api-host 0.0.0.0 \\\n`;
  codeHydraStartNode += `  --peer 127.0.0.1:5002 \\\n`;
  codeHydraStartNode += `  --hydra-verification-key credentials/bob-hydra.vk \\\n`;
  codeHydraStartNode += `  --cardano-verification-key credentials/bob-node.vk\n`;

  let codeOnMessage = `provider.onMessage((message) => {
  console.log(message);
});`;

  let codeGreetingsMessage = `{
  "peer": "bob-node",
  "seq": 0,
  "tag": "PeerConnected",
  "timestamp": "2023-08-17T18:25:02.903Z"
}
{
  "headStatus": "Idle",
  "hydraNodeVersion": "0.12.0-54db...",
  "me": {
    "vkey": "ab159b29b87b498fa060f6045cccf84ecd20cf623f7820ed130ffc849633a120"
  },
  "seq": 1,
  "tag": "Greetings",
  "timestamp": "2023-08-17T18:32:29.092Z"
}`;

  return (
    <>
      <p>
        Scripts are pre-published for all{" "}
        <Link href="https://github.com/cardano-scaling/hydra/releases">
          released
        </Link>{" "}
        HYDRA_VERSIONs of the hydra-node and common Cardano networks. Consult
        the{" "}
        <Link href="https://hydra.family/head-protocol/docs/configuration#reference-scripts">
          user manual
        </Link>{" "}
        for guidance on publishing your own scripts.
      </p>

      <p>Start the hydra-node using these parameters:</p>

      <Codeblock data={codeHydraStartNode} />
      <Button
        onClick={() => startNode()}
        style={loading ? "warning" : "light"}
        disabled={loading}
      >
        Start Node
      </Button>

      <p>
        Verify that the node is operational by establishing a WebSocket
        connection to the API port:
      </p>

      <Codeblock data={codeOnMessage} />

      <p>
        This opens a duplex connection and you should see messages indicating
        successful connections like:
      </p>

      <Codeblock data={codeGreetingsMessage} />
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  return (
    <>
      <Connect provider={provider}
      providerName={providerName}
     />
    </>
  );
}

function Connect({ provider , providerName}: { provider: HydraProvider, providerName: string}) {
  async function runDemo() {
    await provider.connect();
  }

  return (
    <LiveCodeDemo
      title="Connect Hydra Head"
      subtitle="Connect a new Head."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider= {providerName}
    />
  );
}
