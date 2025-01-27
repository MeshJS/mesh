import { useState } from "react";

import { HydraInstance, HydraProvider, MeshWallet } from "@meshsdk/core";

import Button from "~/components/button/button";
import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep5({
  hydraInstance,
  aliceNode,
  aliceFunds,
  bobNode,
  bobFunds,
}: {
  hydraInstance: HydraInstance;
  aliceNode: MeshWallet | undefined;
  aliceFunds: MeshWallet | undefined;
  bobNode: MeshWallet | undefined;
  bobFunds: MeshWallet | undefined;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step5"
      title="Step 5. Use the Hydra head"
      leftSection={Left(
        hydraInstance,
        aliceNode,
        aliceFunds,
        bobNode,
        bobFunds,
      )}
    />
  );
}

function Left(
  hydraInstance: HydraInstance,
  aliceNode: MeshWallet | undefined,
  aliceFunds: MeshWallet | undefined,
  bobNode: MeshWallet | undefined,
  bobFunds: MeshWallet | undefined,
) {
  const [loading, setLoading] = useState<boolean>(false);
  const [addresses, setAddresses] = useState<string>("");
  const [balance, setBalance] = useState<string>("");

  async function fetchUTxOs() {
    const utxos = await hydraInstance.provider.fetchUTxOs();
    console.log("UTXOs: ", utxos);
  }

  async function commitFunds() {
    // commit alice funds
    await hydraInstance.commitFunds();

    // commit bob funds
    await hydraInstance.commitFunds();
  }

  return (
    <>
      <p>
        In this step, we'll demonstrate a basic transaction between alice and
        bob using the Hydra head. Hydra Head operates as an isomorphic protocol,
        meaning that functionalities available on the Cardano layer 1 network
        are also available on the layer 2 network. This compatibility allows us
        to use familiar tools like cardano-cli for transaction creation within
        the head.
      </p>
      <p>
        In this example, we will transfer 10 ada from Alice to Bob. Adjust the
        transaction amount based on the balances previously committed to the
        head.
      </p>
      <p>
        First, we need to select a UTxO to spend. We can find a UTxO by
        referring to the utxo field in the most recent <code>HeadIsOpen</code>{" "}
        or <code>SnapshotConfirmed</code> messages. Alternatively, we can query
        the current UTxO set directly from the API:
      </p>

      <Codeblock data={`const utxos = await hydraInstance.provider.fetchUTxOs();`} />
      <Button
        onClick={() => fetchUTxOs()}
        style={loading ? "warning" : "light"}
        disabled={loading}
      >
        Fetch UTxOs
      </Button>

    </>
  );
}
