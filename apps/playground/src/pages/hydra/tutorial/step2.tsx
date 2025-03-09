import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";

import Button from "~/components/button/button";
import { getProvider } from "~/components/cardano/mesh-wallet";
import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Alert from "~/components/text/alert";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep2({
  aliceNode,
  aliceFunds,
  bobNode,
  bobFunds,
  setAliceNode,
  setAliceFunds,
  setBobNode,
  setBobFunds,
}: {
  aliceNode: MeshWallet | undefined;
  aliceFunds: MeshWallet | undefined;
  bobNode: MeshWallet | undefined;
  bobFunds: MeshWallet | undefined;
  setAliceNode: (wallet: MeshWallet) => void;
  setAliceFunds: (wallet: MeshWallet) => void;
  setBobNode: (wallet: MeshWallet) => void;
  setBobFunds: (wallet: MeshWallet) => void;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="step2"
      title="Step 2. Prepare keys and funding"
      leftSection={Left(
        aliceNode,
        aliceFunds,
        bobNode,
        bobFunds,
        setAliceNode,
        setAliceFunds,
        setBobNode,
        setBobFunds,
      )}
    />
  );
}

function Left(
  aliceNode: MeshWallet | undefined,
  aliceFunds: MeshWallet | undefined,
  bobNode: MeshWallet | undefined,
  bobFunds: MeshWallet | undefined,
  setAliceNode: (wallet: MeshWallet) => void,
  setAliceFunds: (wallet: MeshWallet) => void,
  setBobNode: (wallet: MeshWallet) => void,
  setBobFunds: (wallet: MeshWallet) => void,
) {
  const [loading, setLoading] = useState<boolean>(false);
  const [addresses, setAddresses] = useState<string>("");
  const [balance, setBalance] = useState<string>("");

  async function generateKeys() {
    setLoading(true);

    setTimeout(async () => {
      const provider = getProvider();

      const mnemonicAliceNode = MeshWallet.brew() as string[];
      const walletAliceNode = new MeshWallet({
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        key: {
          type: "mnemonic",
          words: mnemonicAliceNode,
        },
      });
      const mnemonicAliceFunds = MeshWallet.brew() as string[];
      const walletAliceFunds = new MeshWallet({
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        key: {
          type: "mnemonic",
          words: mnemonicAliceFunds,
        },
      });

      const mnemonicBobNode = MeshWallet.brew() as string[];
      const walletBobNode = new MeshWallet({
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        key: {
          type: "mnemonic",
          words: mnemonicBobNode,
        },
      });
      const mnemonicBobFunds = MeshWallet.brew() as string[];
      const walletBobFunds = new MeshWallet({
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        key: {
          type: "mnemonic",
          words: mnemonicBobFunds,
        },
      });

      setAliceNode(walletAliceNode);
      setAliceFunds(walletAliceFunds);
      setBobNode(walletBobNode);
      setBobFunds(walletBobFunds);

      let _addresses = "";
      _addresses += `"Send at least 30 tADA to alice-node:"\n`;
      _addresses += `${await walletAliceNode.getChangeAddress()}\n\n`;
      _addresses += `"Send any amount of tADA or assets to alice-funds:"\n`;
      _addresses += `${await walletAliceFunds.getChangeAddress()}\n\n`;
      _addresses += `"Send at least 30 tADA to bob-node:"\n`;
      _addresses += `${await walletBobNode.getChangeAddress()}\n\n`;
      _addresses += `"Send any amount of tADA or assets to bob-funds:"\n`;
      _addresses += `${await walletBobFunds.getChangeAddress()}\n\n`;
      setAddresses(_addresses);

      setLoading(false);
    }, 500);
  }

  async function getBalance() {
    if (aliceNode && aliceFunds && bobNode && bobFunds) {
      setLoading(true);

      setTimeout(async () => {
        let _balance = "";

        const aliceNodeUtxos = await aliceNode.getUtxos();
        _balance += `Alice Node UTXOs:\n`;
        _balance += `${JSON.stringify(aliceNodeUtxos, null, 2)}\n\n`;

        const aliceFundsUtxos = await aliceFunds.getUtxos();
        _balance += `Alice Funds UTXOs:\n`;
        _balance += `${JSON.stringify(aliceFundsUtxos, null, 2)}\n\n`;

        const bobNodeUtxos = await bobNode.getUtxos();
        _balance += `Bob Node UTXOs:\n`;
        _balance += `${JSON.stringify(bobNodeUtxos, null, 2)}\n\n`;

        const bobFundsUtxos = await bobFunds.getUtxos();
        _balance += `Bob Funds UTXOs:\n`;
        _balance += `${JSON.stringify(bobFundsUtxos, null, 2)}\n\n`;

        setBalance(_balance);

        setLoading(false);
      }, 500);
    }
  }

  async function generateHydraKeys() {
    setLoading(true);

    setTimeout(async () => {
      setLoading(false);
    }, 500);
  }

  return (
    <>
      <p>
        First, generate Cardano key pairs and addresses for both participants to
        identify the hydra-node and manage funds on layer 1:
      </p>

      <Codeblock data={`code about generating keys`} />
      <Button
        onClick={() => generateKeys()}
        style={loading ? "warning" : "light"}
        disabled={loading}
      >
        Generate Keys
      </Button>
      {addresses && <Codeblock data={addresses} />}

      <Alert>
        In case you don't have test ada on preprod, you can use the{" "}
        <Link href="https://docs.cardano.org/cardano-testnets/tools/faucet/">
          testnet faucet
        </Link>{" "}
        to fund your wallet or the addresses above. Note that due to rate
        limiting, it's better to request large sums for efficiency and
        distribute as needed.
      </Alert>

      <p>You can check the balance of your addresses via:</p>
      <Codeblock data={`code about checking balance`} />
      <Button
        onClick={() => getBalance()}
        style={loading ? "warning" : "light"}
        disabled={loading}
      >
        Get Balance
      </Button>
      {balance && <Codeblock data={balance} />}

      <p>
        Next, generate Hydra key pairs for use on layer 2. Use the ??
        hydra-tools to generate the keys for alice and/or bob respectively:
      </p>
      <Codeblock data={`code about generate keys`} />
      <Button
        onClick={() => generateHydraKeys()}
        style={loading ? "warning" : "light"}
        disabled={loading}
      >
        Generate Hydra Keys
      </Button>

      <p>
        If you are collaborating with another individual, exchange the
        verification (public) keys: <code>{"{alice,bob}-node.vk"}</code> and{" "}
        <code>{"{alice,bob}-hydra.vk"}</code> to ensure secure communication.
      </p>

      <p>
        Before launching the hydra-node, it's crucial to establish and
        communicate each participant's network connectivity details. This
        includes the IP addresses and ports where Alice and Bob's nodes will be
        reachable for layer 2 network interactions. For this tutorial, we're
        using placeholder IP addresses and ports which should be replaced with
        your actual network details:
      </p>

      <ul>
        <li>
          Alice's node: <code>127.0.0.1:5001</code>
        </li>
        <li>
          Bob's node: <code>127.0.0.1:5001</code>
        </li>
      </ul>

      <p>
        The next step involves configuring the protocol parameters for the
        ledger within our Hydra head. For the purposes of this tutorial, we'll
        modify the default Cardano layer 1 parameters to eliminate transaction
        fees, simplifying test interactions:
      </p>

      <Codeblock data={`code about PP`} />

      <p>
        This command adjusts the fees and pricing mechanisms to zero, ensuring
        that transactions within the Hydra head incur no costs.
      </p>

      <p>In summary, the Hydra head participants exchanged and agreed on:</p>

      <ul>
        <li>IP addresses and the port on which their hydra-node will run</li>
        <li>A Hydra verification key to identify them in the head</li>
        <li>A Cardano verification key to identify them on the blockchain</li>
        <li>Protocol parameters to use in the Hydra head.</li>
      </ul>
    </>
  );
}
