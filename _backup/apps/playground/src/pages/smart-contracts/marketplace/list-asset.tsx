import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import MintMeshToken from "~/components/cardano/mint-mesh-token";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { asset, getContract, price } from "./common";

export default function MarketplaceListAsset() {
  return (
    <TwoColumnsScroll
      sidebarTo="listAsset"
      title="List Asset"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        List an asset on the marketplace. This will allow other users to buy the
        asset. The seller will receive the listing price in ADA. The seller can
        cancel the listing at any time. The seller can also update the listing
        price at any time.
      </p>
      <p>
        <code>listAsset()</code> list an asset for sale. The function accepts
        the following parameters:
      </p>
      <ul>
        <li>
          <b>asset (string)</b> - the asset's unit to be listed
        </li>
        <li>
          <b>price (number)</b> - the listing price in Lovelace
        </li>
      </ul>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>(price.toString());
  const [userInput2, setUserInput2] = useState<string>(asset);

  async function runDemo() {
    const contract = getContract(wallet);
    const tx = await contract.listAsset(userInput2, parseInt(userInput));
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.listAsset('${userInput2}', ${userInput});\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="List Asset"
      subtitle="List an asset for sale"
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
            placeholder="Listing price in Lovelace"
            label="Listing price in Lovelace"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Asset unit"
            label="Asset unit"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
