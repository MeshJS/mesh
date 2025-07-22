import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";

import { getProvider } from "~/components/cardano/mesh-wallet";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
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
  let cliSnippetAlice = ``;
  cliSnippetAlice += `mkdir -p credentials\n\n`;

  cliSnippetAlice += `cardano-cli address key-gen \\\n`;
  cliSnippetAlice += `  --verification-key-file credentials/alice-node.vk \\\n`;
  cliSnippetAlice += `  --signing-key-file credentials/alice-node.sk\n\n`;

  cliSnippetAlice += `cardano-cli address build \\\n`;
  cliSnippetAlice += `  --payment-verification-key-file credentials/alice-node.vk \\\n`;
  cliSnippetAlice += `  --out-file credentials/alice-node.addr \\\n`;
  cliSnippetAlice += `  --testnet-magic 1\n\n`;

  cliSnippetAlice += `cardano-cli address key-gen \\\n`;
  cliSnippetAlice += `  --verification-key-file credentials/alice-funds.vk \\\n`;
  cliSnippetAlice += `  --signing-key-file credentials/alice-funds.sk\n\n`;

  cliSnippetAlice += `cardano-cli address build \\\n`;
  cliSnippetAlice += `  --payment-verification-key-file credentials/alice-funds.vk \\\n`;
  cliSnippetAlice += `  --out-file credentials/alice-funds.addr \\\n`;
  cliSnippetAlice += `  --testnet-magic 1\n`;

  let cliSnippetBob = ``;
  cliSnippetBob += `mkdir -p credentials\n\n`;

  cliSnippetBob += `cardano-cli address key-gen \\\n`;
  cliSnippetBob += `  --verification-key-file credentials/bob-node.vk \\\n`;
  cliSnippetBob += `  --signing-key-file credentials/bob-node.sk\n\n`;

  cliSnippetBob += `cardano-cli address build \\\n`;
  cliSnippetBob += `  --payment-verification-key-file credentials/bob-node.vk \\\n`;
  cliSnippetBob += `  --out-file credentials/bob-node.addr \\\n`;
  cliSnippetBob += `  --testnet-magic 1\n\n`;

  cliSnippetBob += `cardano-cli address key-gen \\\n`;
  cliSnippetBob += `  --verification-key-file credentials/bob-funds.vk \\\n`;
  cliSnippetBob += `  --signing-key-file credentials/bob-funds.sk\n\n`;

  cliSnippetBob += `cardano-cli address build \\\n`;
  cliSnippetBob += `  --payment-verification-key-file credentials/bob-funds.vk \\\n`;
  cliSnippetBob += `  --out-file credentials/bob-funds.addr \\\n`;
  cliSnippetBob += `  --testnet-magic 1\n`;

  return (
    <>
      <p>
        In a Hydra head, each participant is authenticated using two sets of
        keys. The first set identifies a participant on the Cardano layer 1 and
        is used to hold ada for paying fees. Each hydra-node requires a{" "}
        <code>--cardano-signing-key</code>, and you must provide the{" "}
        <code>--cardano-verification-key</code> for each participant. First,
        generate Cardano key pairs and addresses for both participants with{" "}
        <code>cardano-cli</code> to identify the hydra-node and manage funds on
        layer 1.
      </p>
      <p>Alice's keys:</p>
      <Codeblock data={cliSnippetAlice} />
      <p>Bob's keys:</p>
      <Codeblock data={cliSnippetBob} />

      <p>
        Next, generate Hydra key pairs for use on layer 2. Use this Hydra-CLI
        command to generate the keys for alice and/or bob respectively:
      </p>
      <Codeblock
        data={`hydra-node gen-hydra-key --output-file credentials/alice-hydra`}
      />
      <Codeblock
        data={`hydra-node gen-hydra-key --output-file credentials/bob-hydra`}
      />
      <p>
        The next step involves configuring the protocol parameters for the
        ledger within our Hydra head. For the purposes of this tutorial, we'll
        modify the default Cardano layer 1 parameters to eliminate transaction
        fees,
      </p>
      <Codeblock
        data={`cardano-cli query protocol-parameters --testnet-magic 1 --socket-path /socketPath --out-file protocol-parameters.json`}
      />
      <p>
        Simplifying Hydra fees and environments, change the following
        parameters:
      </p>
      <ul>
        <li>
          <code>txFeeFixed</code> to 0
        </li>
        <li>
          <code>txFeePerByte</code> to 0
        </li>
        <li>
          <code>executionUnitPrices.priceMemory</code> to 0
        </li>
        <li>
          <code>executionUnitPrices.priceSteps</code> to 0
        </li>
      </ul>
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
      <GenerateProtocolParameters />
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

    let _addresses = ``;
    _addresses += `Send at least 30 tADA to alice-node:\n`;
    _addresses += `${await aliceNode.getChangeAddress()}\n\n`;

    _addresses += `Send any amount of tADA to alice-funds:\n`;
    _addresses += `${await aliceFunds.getChangeAddress()}\n\n`;

    _addresses += `Send at least 30 tADA to bob-node:\n`;
    _addresses += `${await bobNode.getChangeAddress()}\n\n`;

    _addresses += `Send any amount of tADA to bob-funds:\n`;
    _addresses += `${await bobFunds.getChangeAddress()}\n`;
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
      title="Generate Mock CLI Keys"
      subtitle="Generate Mock CLI keys for demo (not for testing or production)."
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
      subtitle="Generate Hydra key pairs for demo (not for testing or production)."
      runCodeFunction={runDemo}
      code={keys}
    />
  );
}

function GenerateProtocolParameters() {
  const [protocolParameters, setProtocolParameters] = useState("");

  const runDemo = async () => {
    const provider = getProvider();
    const protocolParameters = await provider.fetchProtocolParameters();
    setProtocolParameters(JSON.stringify(protocolParameters, null, 2));
  };

  return (
    <LiveCodeDemo
      title="Generate Protocol Parameters"
      subtitle="Generate protocol parameters for the ledger."
      runCodeFunction={runDemo}
      code={protocolParameters}
    />
  );
}
