import { useState } from "react";
import Link from "next/link";

import {
  keepRelevant,
  MeshTxBuilder,
  MeshTxBuilderBody,
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
import { demoAddresses } from "~/data/cardano";

export default function TxbuilderBuildWithObject() {
  return (
    <TwoColumnsScroll
      sidebarTo="buildWithObject"
      title="Build with Object"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = ``;

  return (
    <>
      <p>
        One alternative to use the lower level APIs is to build the transaction
        with an object.
      </p>
      <p>
        The following shows a simple example of building a transaction to send
        values to a recipient:
      </p>
      <Codeblock data={code1} />
      <p>
        <Link href="https://github.com/sidan-lab/mesh-lower-level-api-demo/blob/mesh-docs/src/pages/index.tsx#L112C1-L166C1">
          Full Code Snippet in Github
        </Link>
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  const [address, setAddress] = useState<string>(demoAddresses.testnet);
  const [amount, setAmount] = useState<string>("2000000");

  async function runDemo() {
    const blockchainProvider = getProvider();

    const changeAddress = await wallet.getChangeAddress();

    // get utxo
    const assetMap = new Map<Unit, Quantity>();
    assetMap.set("lovelace", amount);

    const walletUtxos = await wallet.getUtxos();
    const utxos = keepRelevant(assetMap, walletUtxos);
    const utxo = utxos[0];

    if (utxo === undefined) {
      throw new Error("No utxo found");
    }

    // transaction
    const txBuilder = new MeshTxBuilder({
      fetcher: blockchainProvider,
    });

    // const meshTxBody: MeshTxBuilderBody = {
    //   inputs: [
    //     {
    //       type: "PubKey",
    //       txIn: {
    //         txHash: utxo.input.txHash,
    //         txIndex: utxo.input.outputIndex,
    //       },
    //     },
    //   ],
    //   outputs: [
    //     {
    //       address: address,
    //       amount: [{ unit: "lovelace", quantity: amount }],
    //     },
    //   ],
    //   collaterals: [],
    //   requiredSignatures: [],
    //   referenceInputs: [],
    //   mints: [],
    //   changeAddress: changeAddress,
    //   metadata: [],
    //   validityRange: {},
    //   signingKey: [],
    // };

    // const unsignedTx = await mesh.complete(meshTxBody);

    // const signedTx = await wallet.signTx(unsignedTx);
    // const txHash = await wallet.submitTx(signedTx);
    return 'txHash';
  }

  let codeSnippet = `import { keepRelevant, MeshTxBuilder, Quantity, Unit } from "@meshsdk/core";\n\n`;

  return (
    <LiveCodeDemo
      title="Send Lovelace"
      subtitle="Send lovelace to a recipient"
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
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address"
            label="Address"
            key={0}
          />,
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            label="Amount"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
