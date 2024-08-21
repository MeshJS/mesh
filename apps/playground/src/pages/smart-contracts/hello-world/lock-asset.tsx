import { useState } from "react";

import { Asset } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { getContract } from "./common";

export default function HelloWorldLock() {
  return (
    <TwoColumnsScroll
      sidebarTo="lockAsset"
      title="Lock Asset"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p></p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("5000000");

  async function runDemo() {
    const contract = getContract(wallet);

    const assets: Asset[] = [
      {
        unit: "lovelace",
        quantity: userInput,
      },
    ];

    const tx = await contract.lockAsset(assets);
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const assets: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: "lovelace",\n`;
  code += `    quantity: '${userInput}',\n`;
  code += `  },\n`;
  code += `];\n`;
  code += `\n`;
  code += `const tx = await contract.lockAsset(assets);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Lock Asset"
      subtitle="Lock asset in the contract"
      runCodeFunction={runDemo}
      code={code}
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
            placeholder="Lovelace amount"
            label="Lovelace amount"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
