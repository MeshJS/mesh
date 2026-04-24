import { useState } from "react";

import { Asset } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoAsset } from "~/data/cardano";
import { getContract } from "./common";

export default function SwapInitiateSwap() {
  return (
    <TwoColumnsScroll
      sidebarTo="initiateSwap"
      title="Initiate Swap"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        User A can initiate a swap by providing assets to the swap contract.
      </p>
      <p>
        <code>initiateSwap()</code> initiate a swap. The function accepts the
        following parameters:
      </p>
      <ul>
        <li>
          <b>toProvide (Asset[])</b> - a list of assets user A is trading
        </li>
        <li>
          <b>toReceive (Asset[])</b> - a list of assets user A is expecting to
          receive from another user
        </li>
      </ul>
      <p>
        Note that the parameters are arrays, so you can provide multiple assets
        to the swap, and these assets can be tokens and lovelace.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("10000000");
  const [userInput2, setUserInput2] = useState<string>(demoAsset);

  async function runDemo() {
    const contract = getContract(wallet);

    const assetToProvide: Asset = {
      unit: "lovelace",
      quantity: userInput,
    };

    const assetToReceive: Asset = {
      unit: userInput2,
      quantity: "1",
    };

    const tx = await contract.initiateSwap([assetToProvide], [assetToReceive]);
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const assetToProvide: Asset = {\n`;
  code += `  unit: "lovelace",\n`;
  code += `  quantity: '${userInput}',\n`;
  code += `};\n`;
  code += `\n`;
  code += `const assetToReceive: Asset = {\n`;
  code += `  unit: '${userInput2}',\n`;
  code += `  quantity: "1",\n`;
  code += `};\n`;
  code += `\n`;
  code += `const tx = await contract.initiateSwap([assetToProvide], [assetToReceive]);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Initiate Swap"
      subtitle="Initiate a swap by defining the assets for the swap contract"
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
            placeholder="Amount lovelace to give"
            label="Amount lovelace to give"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Asset to receive"
            label="Asset to receive"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
