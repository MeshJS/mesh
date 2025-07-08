import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";

import Button from "~/components/button/button";
import { getProvider } from "~/components/cardano/mesh-wallet";
import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Alert from "~/components/text/alert";
import Codeblock from "~/components/text/codeblock";

export default function HydraTutorialStep1({
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
      sidebarTo="step1"
      title="Step 1. Prepare keys and funding"
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

  async function generateAddress() {
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

  let codeAliceCliCommand = ``;
  codeAliceCliCommand += `mkdir -p credentials\\\n`;
  codeAliceCliCommand += `  cardano-cli address key-gen \\\n`;
  codeAliceCliCommand += `    --verification-key-file credentials/alice-node.vk \\\n`;
  codeAliceCliCommand += `    --signing-key-file credentials/alice-node.sk \\\n\n`;
  codeAliceCliCommand += `  cardano-cli address build \\\n`;
  codeAliceCliCommand += `    --verification-key-file credentials/alice-node.vk \\\n`;
  codeAliceCliCommand += `    --out-file credentials/alice-node.addr \\\n\n`;
  codeAliceCliCommand += `  cardano-cli address key-gen \\\n`;
  codeAliceCliCommand += `    --verification-key-file credentials/alice-funds.vk \\\n`;
  codeAliceCliCommand += `    --signing-key-file credentials/alice-funds.sk \\\n\n`;
  codeAliceCliCommand += `  cardano-cli address build \\\n`;
  codeAliceCliCommand += `    --verification-key-file credentials/alice-funds.vk \\\n`;
  codeAliceCliCommand += `    --out-file credentials/alice-funds.addr`;
  codeAliceCliCommand += `\n\n`;

  let codeBobCliCommand = ``;
  codeBobCliCommand += `mkdir -p credentials\\\n`;
  codeBobCliCommand += `  cardano-cli address key-gen \\\n`;
  codeBobCliCommand += `    --verification-key-file credentials/bob-node.vk \\\n`;
  codeBobCliCommand += `    --signing-key-file credentials/bob-node.sk \\\n\n`;
  codeBobCliCommand += `  cardano-cli address build \\\n`;
  codeBobCliCommand += `    --verification-key-file credentials/bob-node.vk \\\n`;
  codeBobCliCommand += `    --out-file credentials/bob-node.addr \\\n\n`;
  codeBobCliCommand += `  cardano-cli address key-gen \\\n`;
  codeBobCliCommand += `    --verification-key-file credentials/bob-funds.vk \\\n`;
  codeBobCliCommand += `    --signing-key-file credentials/bob-funds.sk \\\n\n`;
  codeBobCliCommand += `  cardano-cli address build \\\n`;
  codeBobCliCommand += `    --verification-key-file credentials/bob-funds.vk \\\n`;
  codeBobCliCommand += `    --out-file credentials/bob-funds.addr`;
  codeBobCliCommand += `\n\n`;

  let code

  return (
    <>
      <p>
        First, generate Cardano key pairs and addresses for both participants to
        identify the hydra-node and manage funds on layer 1 if you already have
        your CLI keys generated, you can skip the key generation step and move
        to <Link href="">Step 2</Link>
      </p>
      If you don't have your CLI keys generated, you can use the following{" "}
      <code>cardano-cli</code> commands to generate the keys and addresses for
      <p>
        Alice :
        <Codeblock
          data={codeAliceCliCommand}
        />
      </p>
      Bob:
      <Codeblock
        data={codeBobCliCommand}
      />
      <Button
        onClick={() => generateAddress ()}
        style={loading ? "warning" : "light"}
        disabled={loading}
      >
        Generate Addresses
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
      <p>
        you can use blockfrost or any other mesh supported providers to get
        address UTxOs like this
      </p>
      <Codeblock
        data={
      `import { BlockfrostProvider } from "@meshsdk/core";\n
      const provider = new BlockfrostProvider(<API_KEY>);
      const aliceNodeUtxos = await provider.fetchAddressUtxos(${aliceNode?.getAddresses().baseAddressBech32 ?? "address"});
      const aliceFundsUtxos = await provider.fetchAddressUtxos(${aliceFunds?.getAddresses().baseAddressBech32 ?? "address"});\n
      const bobNodeUtxos = await provider.fetchAddressUtxos(${bobNode?.getAddresses().baseAddressBech32 ?? "address"});
      const bobFundUtxos = await provider.fetchAddressUtxos(${bobFunds?.getAddresses().baseAddressBech32 ?? "address"});
     `}
      />
      <Button
        onClick={() => getBalance()}
        style={loading ? "warning" : "light"}
        disabled={loading}
      >
        Get Balance
      </Button>
      {balance && <Codeblock data={balance} />}
      <p>
        Next, generate Hydra key pairs for use on layer 2. Use the following
        hydra-tools commands to generate the keys for Alice and Bob
        respectively:
      </p>
      Alice:
      <Codeblock
        data={`hydra-node gen-hydra-key --output-file credentials/alice-hydra`}
      />
      Bob:
      <Codeblock
        data={`hydra-node gen-hydra-key --output-file credentials/bob-hydra`}
      />
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
          Alice's node: <code>127.0.0.1:4001</code>
        </li>
        <li>
          Bob's node: <code>127.0.0.1:4001</code>
        </li>
      </ul>
      <p>
        The next step involves configuring the protocol parameters for the
        ledger within our Hydra head.
      </p>
      <p>
        The <code>Mesh-hydra</code> provider already includes the required
        protocol parameters. This means that the necessary configuration for the
        protocol is predefined within the provider. In step 2, you will find a
        more detailed explanation of how protocol parameters are declared and
        utilized with Mesh.
        <Codeblock
          data={`const protocolParams = await provider.fetchProtocolParameters`}
        />
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
