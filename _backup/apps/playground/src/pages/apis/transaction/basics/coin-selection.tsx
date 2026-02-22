import { useState } from "react";

import {
  keepRelevant,
  largestFirst,
  largestFirstMultiAsset,
  Quantity,
  Unit,
} from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset } from "~/data/cardano";

export default function TransactionCoinSelection() {
  return (
    <TwoColumnsScroll
      sidebarTo="coinSelection"
      title="Coin selection"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSnippet1 = `import { largestFirst } from '@meshsdk/core';\n\n`;
  codeSnippet1 += `const utxos = await wallet.getUtxos();\n\n`;
  codeSnippet1 += `const costLovelace = '10000000';\n`;
  codeSnippet1 += `const selectedUtxos = largestFirst(costLovelace, utxos, true);`;

  let codeSnippet2 = `import { largestFirstMultiAsset } from '@meshsdk/core';\n`;
  codeSnippet2 += `import type { Unit, Quantity } from '@meshsdk/core';\n\n`;
  codeSnippet2 += `const utxos = await wallet.getUtxos();\n\n`;
  codeSnippet2 += `const assetMap = new Map<Unit, Quantity>();\n`;
  codeSnippet2 += `assetMap.set(\n`;
  codeSnippet2 += `  '${demoAsset}',\n`;
  codeSnippet2 += `  '1'\n`;
  codeSnippet2 += `);\n`;
  codeSnippet2 += `// if you need to include lovelace\n`;
  codeSnippet2 += `assetMap.set(\n`;
  codeSnippet2 += `  'lovelace',\n`;
  codeSnippet2 += `  '10000000'\n`;
  codeSnippet2 += `);\n`;
  codeSnippet2 += `// if you need to include more than 1 native asset\n`;
  codeSnippet2 += `assetMap.set(\n`;
  codeSnippet2 += `  'another asset unit',\n`;
  codeSnippet2 += `  '1'\n`;
  codeSnippet2 += `);\n\n`;
  codeSnippet2 += `const selectedUtxos = largestFirstMultiAsset(assetMap, utxos, true);`;

  let code3 = ``;
  code3 += `largestFirst = (\n`;
  code3 += `  lovelace: Quantity, initialUTxOSet: UTxO[], includeTxFees = false,\n`;
  code3 += `  { maxTxSize, minFeeA, minFeeB } = DEFAULT_PROTOCOL_PARAMETERS,\n`;
  code3 += `): UTxO[]`;
  let code4 = ``;
  code4 += `largestFirstMultiAsset = (\n`;
  code4 += `  requestedOutputSet: Map<Unit, Quantity>, initialUTxOSet: UTxO[],\n`;
  code4 += `  includeTxFees = false, parameters = DEFAULT_PROTOCOL_PARAMETERS,\n`;
  code4 += `): UTxO[]\n`;

  let codeKeepRelevant = ``;
  codeKeepRelevant += `import { keepRelevant } from '@meshsdk/core';\n`;
  codeKeepRelevant += `import type { Unit, Quantity } from '@meshsdk/core';\n`;
  codeKeepRelevant += `\n`;
  codeKeepRelevant += `const utxos = await wallet.getUtxos();\n\n`;
  codeKeepRelevant += `const assetMap = new Map<Unit, Quantity>();\n`;
  codeKeepRelevant += `assetMap.set(\n`;
  codeKeepRelevant += `  '${demoAsset}',\n`;
  codeKeepRelevant += `  '1'\n`;
  codeKeepRelevant += `);\n`;
  codeKeepRelevant += `// if you need to include lovelace\n`;
  codeKeepRelevant += `assetMap.set(\n`;
  codeKeepRelevant += `  'lovelace',\n`;
  codeKeepRelevant += `  '10000000'\n`;
  codeKeepRelevant += `);\n\n`;
  codeKeepRelevant += `const selectedUtxos = keepRelevant(assetMap, utxos);\n`;

  let codeKeepRelevantDesc = ``;
  codeKeepRelevantDesc += `keepRelevant = (\n`;
  codeKeepRelevantDesc += `  requestedOutputSet: Map<Unit, Quantity>,\n`;
  codeKeepRelevantDesc += `  initialUTxOSet: UTxO[],\n`;
  codeKeepRelevantDesc += `  minimumLovelaceRequired = '5000000',\n`;
  codeKeepRelevantDesc += `);\n`;

  return (
    <>
      <p>There are currently three coin selection algorithms available:</p>
      <ul>
        <li>Keep Relevant</li>
        <li>Largest First</li>
        <li>Largest First Multi-Asset</li>
      </ul>

      <h3>Keep Relevant</h3>
      <p>
        <code>keepRelevant</code> is a two-step coin selection algorithm. First,
        given a Map (of requested assets and respective quantities) and a set of
        UTxOs, it tries to eliminate the irrelevant UTxOs from the set. Next, it
        checks that this UTxO set includes enough lovelace to cover all/any
        multi-assets in the set. If the set does not include enough lovelace,
        then it will try to also pick up another UTxO from the wallet,
        containing the largest amount of lovelace.
      </p>
      <Codeblock data={codeKeepRelevantDesc} />
      <p>
        Here is an example how you can use <code>keepRelevant()</code>:
      </p>
      <Codeblock data={codeKeepRelevant} />

      <h3>Largest First</h3>
      <p>
        To select UTXOs for transaction that only requires lovelace, use{" "}
        <code>largestFirst</code>.
      </p>
      <Codeblock data={code3} />
      <p>For example, selecting the UTXOs for sending 10000000 lovelace:</p>
      <Codeblock data={codeSnippet1} />

      <h3>Largest First Multi-Asset</h3>
      <p>
        <code>largestFirstMultiAsset</code> allows you to define which native
        assets you require for sending out by defining a <code>Map</code>. The
        Map is matches the <code>Unit</code> with the quantity of each asset.
      </p>
      <Codeblock data={code4} />
      <p>
        Note that if lovelace, aside from the "minimum Ada" which in any case
        needs to accompany the other assets, this must be explicitly specified.
        This can also be useful in the case that your transaction <em>only</em>{" "}
        requires transfer of lovelace. In this case, the algorithm will exclude
        all multiasset UTxOs from the selection, which can result in more
        efficient selection of the required UTxOs.
      </p>
      <Codeblock data={codeSnippet2} />
      <p>
        The third parameter is <code>includeTxFees</code>. If <code>True</code>,
        Mesh will calculate the fees required for the transaction, and include
        additional UTxOs to necessary to fulfill the fees requirements.
      </p>
    </>
  );
}

function Right() {
  return (
    <>
      <DemoKeepRelevant />
      <DemoLargestFirst />
      <DemoLargestFirstMultiAsset />
    </>
  );
}

function DemoLargestFirst() {
  const { wallet, connected } = useWallet();
  const [amount, setAmount] = useState<string>("15000000");

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const selectedUtxos = largestFirst(amount, utxos, true);
    return selectedUtxos;
  }

  let code = ``;
  code += `const utxos = await wallet.getUtxos();\n`;
  code += `const selectedUtxos = largestFirst('${amount}', utxos, true);\n`;

  return (
    <LiveCodeDemo
      title="Coin selection - Largest First"
      subtitle="Select the UTXOs with the most ADA first"
      code={code}
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Lovelace Amount"
            label="Lovelace Amount"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}

function DemoLargestFirstMultiAsset() {
  const { wallet, connected } = useWallet();
  const [amount, setAmount] = useState<string>("15000000");
  const [asset, setAsset] = useState<string>(demoAsset);

  async function runDemo() {
    const utxos = await wallet.getUtxos();

    const assetMap = new Map<Unit, Quantity>();
    assetMap.set("lovelace", amount);
    assetMap.set(asset, "1");

    const selectedUtxos = largestFirstMultiAsset(assetMap, utxos, true);
    return selectedUtxos;
  }

  let code = ``;
  code += `const utxos = await wallet.getUtxos();\n`;
  code += `\n`;
  code += `const assetMap = new Map<Unit, Quantity>();\n`;
  code += `assetMap.set("lovelace", '${amount}');\n`;
  code += `assetMap.set('${asset}', "1");\n`;
  code += `\n`;
  code += `const selectedUtxos = largestFirstMultiAsset(assetMap, utxos, true);\n`;

  return (
    <LiveCodeDemo
      title="Coin selection - Largest First Multi-Asset"
      subtitle="Select the UTXOs with the most ADA and asset first"
      code={code}
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Lovelace Amount"
            label="Lovelace Amount"
            key={0}
          />,
          <Input
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="Asset"
            label="Asset"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}

function DemoKeepRelevant() {
  const { wallet, connected } = useWallet();
  const [amount, setAmount] = useState<string>("15000000");
  const [asset, setAsset] = useState<string>(demoAsset);

  async function runDemo() {
    const utxos = await wallet.getUtxos();

    const assetMap = new Map<Unit, Quantity>();
    assetMap.set("lovelace", amount);
    assetMap.set(asset, "1");

    const selectedUtxos = keepRelevant(assetMap, utxos);
    return selectedUtxos;
  }

  let code = ``;
  code += `const utxos = await wallet.getUtxos();\n`;
  code += `\n`;
  code += `const assetMap = new Map<Unit, Quantity>();\n`;
  code += `assetMap.set("lovelace", '${amount}');\n`;
  code += `assetMap.set('${asset}', "1");\n`;
  code += `\n`;
  code += `const selectedUtxos = keepRelevant(assetMap, utxos);\n`;

  return (
    <LiveCodeDemo
      title="Coin selection - Keep Relevant"
      subtitle="Select the UTXOs with a two-step coin selection algorithm"
      code={code}
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Lovelace Amount"
            label="Lovelace Amount"
            key={0}
          />,
          <Input
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="Asset"
            label="Asset"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
