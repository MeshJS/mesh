import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";

import Button from "~/components/button/button";
import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep3({
  aliceNode,
  aliceFunds,
  bobNode,
  bobFunds,
}: {
  aliceNode: MeshWallet | undefined;
  aliceFunds: MeshWallet | undefined;
  bobNode: MeshWallet | undefined;
  bobFunds: MeshWallet | undefined;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step3"
      title="Step 3. Start the Hydra node"
      leftSection={Left(aliceNode, aliceFunds, bobNode, bobFunds)}
    />
  );
}

function Left(
  aliceNode: MeshWallet | undefined,
  aliceFunds: MeshWallet | undefined,
  bobNode: MeshWallet | undefined,
  bobFunds: MeshWallet | undefined,
) {
  const [loading, setLoading] = useState<boolean>(false);
  const [addresses, setAddresses] = useState<string>("");
  const [balance, setBalance] = useState<string>("");

  async function startNode() {}

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

      <Codeblock data={`code about starting node`} />
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

      <Codeblock data={`websocat ws://127.0.0.1:4001 | jq`} />
    </>
  );
}
