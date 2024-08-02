import { useState } from "react";

import {
  keepRelevant,
  MeshTxBuilder,
  PlutusScript,
  Quantity,
  Unit,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoPlutusMintingScript } from "~/data/cardano";

export default function TxbuilderContractPlutusMinting() {
  return (
    <TwoColumnsScroll
      sidebarTo="TxbuilderContractPlutusMinting"
      title="Plutus Minting"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = ``;

  return (
    <>
      <p></p>
      <Codeblock data={code1} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [userInput, setUserInput] = useState<string>("mesh");

  async function runDemo() {
    const blockchainProvider = getProvider();

    const walletAddress = await wallet.getChangeAddress();

    // script
    const script: PlutusScript = {
      code: demoPlutusMintingScript,
      version: "V2",
    };

    // get utxo
    const assetMap = new Map<Unit, Quantity>();
    assetMap.set("lovelace", "5000000");

    const walletUtxos = await wallet.getUtxos();
    const utxos = keepRelevant(assetMap, walletUtxos);
    const utxo = utxos[0];

    if (utxo === undefined) {
      throw new Error("No utxo found");
    }

    // const signedTx = await wallet.signTx(unsignedTx);
    // const txHash = await wallet.submitTx(signedTx);
    return "txHash";
  }

  let codeSnippet = `import { keepRelevant, MeshTxBuilder, Quantity, Unit } from "@meshsdk/core";\n\n`;

  return (
    <LiveCodeDemo
      title="Plutus Minting"
      subtitle="Mint assets with a Plutus script"
      code={codeSnippet}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Datum"
            label="Datum"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
