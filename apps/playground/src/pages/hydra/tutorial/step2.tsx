import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep2() {
  return (
    <TwoColumnsScroll
      sidebarTo="step2"
      title="Step 2. Configure Hydra nodes"
      leftSection={Left()}
    />
  );
}

function Left() {
  let aliceHydraConfig = `hydra-node \\\n`;
  aliceHydraConfig += `  --node-id alice-node \\\n`;
  aliceHydraConfig += `  --api-host 0.0.0.0 \\\n`;
  aliceHydraConfig += `  --api-port 4001 \\\n`;
  aliceHydraConfig += `  --listen 172.16.239.10:5001 \\\n`;
  aliceHydraConfig += `  --monitoring-port 6001 \\\n`;
  aliceHydraConfig += `  --peer 172.16.239.20:5001 \\\n`;
  aliceHydraConfig += `  --hydra-scripts-tx-id c9c4d820d5575173cfa81ba2d2d1096fc40f84d16d8c17284da410a4fb5e64eb,ae4443b46f550289337fc5c2c52b24f1288dab36d1a229167a6e04f056a966fe,48bd29e43dd01d12ab464f75fe40eed80e4051c8d3409e1cb20b8c01120b425e \\\n`;
  aliceHydraConfig += `  --cardano-signing-key /credentials/alice-node.sk \\\n`;
  aliceHydraConfig += `  --cardano-verification-key /credentials/bob-node.vk \\\n`;
  aliceHydraConfig += `  --hydra-signing-key /keys/alice-hydra.sk \\\n`;
  aliceHydraConfig += `  --hydra-verification-key /keys/bob-hydra.vk \\\n`;
  aliceHydraConfig += `  --ledger-protocol-parameters ./testnet/protocol-parameters.json \\\n`;
  aliceHydraConfig += `  --testnet-magic 1 \\\n`;
  aliceHydraConfig += `  --node-socket /cardano-node/db/node.socket \\\n`;
  aliceHydraConfig += `  --contestation-period 5s\n`;

  let bobHydraConfig = `hydra-node \\\n`;
  bobHydraConfig += `  --node-id bob-node \\\n`;
  bobHydraConfig += `  --api-host 0.0.0.0 \\\n`;
  bobHydraConfig += `  --api-port 4001 \\\n`;
  bobHydraConfig += `  --listen 172.16.239.20:5001 \\\n`;
  bobHydraConfig += `  --monitoring-port 6001 \\\n`;
  bobHydraConfig += `  --peer 172.16.239.10:5001 \\\n`;
  bobHydraConfig += `  --hydra-scripts-tx-id c9c4d820d5575173cfa81ba2d2d1096fc40f84d16d8c17284da410a4fb5e64eb,ae4443b46f550289337fc5c2c52b24f1288dab36d1a229167a6e04f056a966fe,48bd29e43dd01d12ab464f75fe40eed80e4051c8d3409e1cb20b8c01120b425e \\\n`;
  bobHydraConfig += `  --cardano-signing-key /credentials/bob-node.sk \\\n`;
  bobHydraConfig += `  --cardano-verification-key /credentials/alice-node.vk \\\n`;
  bobHydraConfig += `  --hydra-signing-key /keys/bob-hydra.sk \\\n`;
  bobHydraConfig += `  --hydra-verification-key /keys/alice-hydra.vk \\\n`;
  bobHydraConfig += `  --ledger-protocol-parameters ./testnet/protocol-parameters.json \\\n`;
  bobHydraConfig += `  --testnet-magic 1 \\\n`;
  bobHydraConfig += `  --node-socket /cardano-node/db/node.socket \\\n`;
  bobHydraConfig += `  --contestation-period 5s\n`;

  return (
    <>
      <p>
        Configure your Hydra nodes with the generated keys and network settings.
        Each participant needs to set up their hydra-node with the correct
        configuration.
      </p>
      <p>Alice:</p>
      <Codeblock data={aliceHydraConfig} />
      <p>Bob:</p>
      <Codeblock data={bobHydraConfig} />
      <p>Fields in the Hydra node configuration:</p>
      <ul>
        <li>
          <code>node-id</code>: Unique identifier for each Hydra node. This
          distinguishes Alice's node from Bob's node.
        </li>
        <li>
          <code>api-host</code>: as the API is not authenticated by default, the
          node is only binding to <code>0.0.0.0</code>.
        </li>
        <li>
          <code>api-port</code>: The port on which the API will listen.
        </li>
        <li>
          <code>listen</code>: The IP address and port on which the Hydra node
          will listen for incoming connections.
        </li>
        <li>
          <code>peer</code>: The IP address of another Hydra node to connect to.
          This is how nodes discover and communicate with each other.
        </li>
        <li>
          <code>monitoring-port</code>: The port on which the monitoring API
          will listen. This is used to monitor the Hydra node's performance.
        </li>
        <li>
          <code>cardano-signing-key</code>: These keys authenticate on-chain
          transactions and ensure that only authorized participants can control
          the head's lifecycle used to hold ada for paying fees
        </li>
        <li>
          <code>hydra-signing-key</code>: Used for multi-signing snapshots
          within a head. Although these keys may eventually support an
          aggregated multi-signature scheme, they currently use the Ed25519
          format.
        </li>
        <li>
          <code>hydra-scripts-tx-id</code>: The hydra-node uses reference
          scripts to reduce transaction sizes driving the head's lifecycle. For
          public (test) networks, you can use the{" "}
          <Link href="https://github.com/cardano-scaling/hydra/blob/master/hydra-node/networks.json">
            pre-published Hydra scripts
          </Link>{" "}
          with each new release, listing transaction IDs in the release notes
          and networks.json.
          Note: The value of above <code>--hydra-scripts-tx-id</code> comes from the hydra-node release 0.22.2.
        </li>
        <li>
          <code>ledger-protocol-parameters</code>: This defines the updatable
          protocol parameters such as fees or transaction sizes. These
          parameters follow the same format as the{" "}
          <code>cardano-cli query protocol-parameters</code> output.
        </li>
        <li>
          <code>contestation-period</code>:This is an important protocol
          parameter, defined in seconds The contestation period is used to set
          the contestation deadline. That is, after <code>Close</code>, all
          participants have at minimum <code>CP</code> to submit a{" "}
          <code>Contest</code> transaction
        </li>
      </ul>
      More on hydra{" "}
      <Link href="https://hydra.family/head-protocol/docs/configuration">
        configuration
      </Link>
      .
      <p>
        Ensure both nodes can communicate with each other and change to your
        correct file paths in the above configuration. This configuration sets
        up Alice's node to listen on port 4001 and connect to Bob's node on port
        4001.
      </p>
    </>
  );
}
