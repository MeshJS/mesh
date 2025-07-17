import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";

import Button from "~/components/button/button";
import { getProvider } from "~/components/cardano/mesh-wallet";
import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
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
      leftSection={Left()}
      rightSection={Right({
        aliceNode,
        aliceFunds,
        bobNode,
        bobFunds,
        setAliceNode,
        setAliceFunds,
        setBobNode,
        setBobFunds,
      })}
    />
  );
}

function Left() {
  const cliSnippetAlice = `mkdir -p credentials
cardano-cli address key-gen \\
  --verification-key-file credentials/alice-node.vk \\
  --signing-key-file credentials/alice-node.sk

cardano-cli address build \\
  --verification-key-file credentials/alice-node.vk \\
  --out-file credentials/alice-node.addr

cardano-cli address key-gen \\
  --verification-key-file credentials/alice-funds.vk \\
  --signing-key-file credentials/alice-funds.sk

cardano-cli address build \\
  --verification-key-file credentials/alice-funds.vk \\
  --out-file credentials/alice-funds.addr`;

  const cliSnippetBob = `mkdir -p credentials
cardano-cli address key-gen \\
  --verification-key-file credentials/bob-node.vk \\
  --signing-key-file credentials/bob-node.sk

cardano-cli address build \\
  --verification-key-file credentials/bob-node.vk \\
  --out-file credentials/bob-node.addr

cardano-cli address key-gen \\
  --verification-key-file credentials/bob-funds.vk \\
  --signing-key-file credentials/bob-funds.sk

cardano-cli address build \\
  --verification-key-file credentials/bob-funds.vk \\
  --out-file credentials/bob-funds.addr`;

  return (
    <>
      <p>
        First, generate Cardano key pairs and addresses for both participants to
        identify the hydra-node and manage funds on layer 1. If you already have
        your CLI keys generated, you can skip the key generation step and move
        to <Link href="/HydraTutorialStep2">Step 2</Link>.
      </p>
      <p>Alice:</p>
      <Codeblock data={cliSnippetAlice} />
      <p>Bob:</p>
      <Codeblock data={cliSnippetBob} />

      <Alert>
        Get test ADA from the{" "}
        <Link href="https://docs.cardano.org/cardano-testnets/tools/faucet/">
          faucet
        </Link>
        . Request larger amounts for efficiency.
      </Alert>

      <p>
        Exchange verification keys:
        <code>{"{alice,bob}-node.vk"}</code> and{" "}
        <code>{"{alice,bob}-hydra.vk"}</code>.
      </p>
      <p>Agree on IP/port and use the following configuration example:</p>
      <ul>
        <li>
          Alice's node: <code>127.0.0.1:4001</code>
        </li>
        <li>
          Bob's node: <code>127.0.0.1:4002</code>
        </li>
      </ul>
      <p>
        <b>Mesh Hydra</b> automatically provides protocol parameters using:
      </p>
      <Codeblock
        data={`const protocolParams = await provider.fetchProtocolParameters()`}
      />
    </>
  );
}

function Right({
  setAliceNode,
  setAliceFunds,
  setBobNode,
  setBobFunds,
  aliceNode,
  aliceFunds,
  bobNode,
  bobFunds,
}: {
  setAliceNode: (wallet: MeshWallet) => void;
  setAliceFunds: (wallet: MeshWallet) => void;
  setBobNode: (wallet: MeshWallet) => void;
  setBobFunds: (wallet: MeshWallet) => void;
  aliceNode: MeshWallet | undefined;
  aliceFunds: MeshWallet | undefined;
  bobNode: MeshWallet | undefined;
  bobFunds: MeshWallet | undefined;
}) {
  return (
    <>
      <GenerateDemoCliKeys />
      <GenerateAddress
        setAliceNode={setAliceNode}
        setAliceFunds={setAliceFunds}
        setBobNode={setBobNode}
        setBobFunds={setBobFunds}
      />
      <GetBalanceUTxOs
        aliceNode={aliceNode}
        aliceFunds={aliceFunds}
        bobNode={bobNode}
        bobFunds={bobFunds}
      />
      <GenerateHydraKeys />
    </>
  );
}

function GenerateAddress({
  setAliceNode,
  setAliceFunds,
  setBobNode,
  setBobFunds,
}: {
  setAliceNode: (wallet: MeshWallet) => void;
  setAliceFunds: (wallet: MeshWallet) => void;
  setBobNode: (wallet: MeshWallet) => void;
  setBobFunds: (wallet: MeshWallet) => void;
}) {
  const [addresses, setAddresses] = useState("");

  const runDemo = async () => {
    const provider = getProvider();

    const createWallet = () =>
      new MeshWallet({
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        key: {
          type: "mnemonic",
          words: MeshWallet.brew() as string[],
        },
      });

    const aliceNode = createWallet();
    const aliceFunds = createWallet();
    const bobNode = createWallet();
    const bobFunds = createWallet();

    setAliceNode(aliceNode);
    setAliceFunds(aliceFunds);
    setBobNode(bobNode);
    setBobFunds(bobFunds);

    const _addresses = `
    Send at least 30 tADA to alice-node:
    ${await aliceNode.getChangeAddress()}

    Send any amount of tADA to alice-funds:
    ${await aliceFunds.getChangeAddress()}

    Send at least 30 tADA to bob-node:
    ${await bobNode.getChangeAddress()}

    Send any amount of tADA to bob-funds:
    ${await bobFunds.getChangeAddress()}
    `;

    setAddresses(_addresses);
  };

  return (
    <LiveCodeDemo
      title="Generate Wallet Addresses"
      subtitle="Generates Cardano wallet addresses using Mesh SDK."
      runCodeFunction={runDemo}
      code={addresses}
    />
  );
}

function GenerateDemoCliKeys() {
  const [keys, setKeys] = useState("");

  const runDemo = async () => {
    function cryptoRandomHex(length: number): string {
      const chars = "abcdef0123456789";
      return [...Array(length)]
        .map(() => chars[Math.floor(Math.random() * chars.length)])
        .join("");
    }

    function generateMockKeyPair() {
      return {
        vkey: {
          type: "PaymentVerificationKeyShelley_ed25519",
          description: "Payment Verification Key",
          cborHex: "5820" + cryptoRandomHex(64),
        },
        skey: {
          type: "PaymentSigningKeyShelley_ed25519",
          description: "Payment Signing Key",
          cborHex: "5820" + cryptoRandomHex(64),
        },
      };
    }

    const demo = {
      AliceNode: generateMockKeyPair(),
      AliceFunds: generateMockKeyPair(),
      BobNode: generateMockKeyPair(),
      BobFunds: generateMockKeyPair(),
    };

    setKeys(JSON.stringify(demo, null, 2));
  };

  return (
    <LiveCodeDemo
      title="Generate Demo CLI Keys"
      subtitle="Simulates CLI key generation for demo use (not for mainnet)."
      runCodeFunction={runDemo}
      code={keys}
    />
  );
}

function GetBalanceUTxOs({
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
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState("");

  const getBalance = async () => {
    if (aliceNode && aliceFunds && bobNode && bobFunds) {
      setLoading(true);
      let _balance = "";

      const aliceNodeUtxos = await aliceNode.getUtxos();
      _balance += `Alice Node UTXOs:\n${JSON.stringify(aliceNodeUtxos, null, 2)}\n\n`;

      const aliceFundsUtxos = await aliceFunds.getUtxos();
      _balance += `Alice Funds UTXOs:\n${JSON.stringify(aliceFundsUtxos, null, 2)}\n\n`;

      const bobNodeUtxos = await bobNode.getUtxos();
      _balance += `Bob Node UTXOs:\n${JSON.stringify(bobNodeUtxos, null, 2)}\n\n`;

      const bobFundsUtxos = await bobFunds.getUtxos();
      _balance += `Bob Funds UTXOs:\n${JSON.stringify(bobFundsUtxos, null, 2)}\n\n`;

      setBalance(_balance);
      setLoading(false);
    }
  };

  return (
    <LiveCodeDemo
      title="Check Wallet UTxOs"
      subtitle="Fetch and display wallet UTxOs for all participants."
      runCodeFunction={getBalance}
      code={balance}
    />
  );
}

function GenerateHydraKeys() {
  const [keys, setKeys] = useState("");

  const runDemo = async () => {
    const randomHex = (length: number) =>
      [...Array(length)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("");

    const hydraKey = {
      vkey: {
        type: "HydraVerificationKey_ed25519",
        description: "Verification Key",
        cborHex: "5820" + randomHex(64),
      },
      skey: {
        type: "HydraSigningKey_ed25519",
        description: "Signing Key",
        cborHex: "5820" + randomHex(128),
      },
    };

    setKeys(JSON.stringify(hydraKey, null, 2));
  };

  return (
    <LiveCodeDemo
      title="Generate Mock Hydra Keys"
      subtitle="Simulates hydra-node key generation output."
      runCodeFunction={runDemo}
      code={keys}
    />
  );
}
