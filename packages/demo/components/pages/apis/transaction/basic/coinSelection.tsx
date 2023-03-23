import Codeblock from '../../../../ui/codeblock';
import SectionTwoCol from '../../../../common/sectionTwoCol';
// import { useWallet } from '@meshsdk/react';
// import { largestFirstMultiAsset, keepRelevant } from '@meshsdk/core';
// import type { Unit, Quantity } from '@meshsdk/core';
// import ConnectCipWallet from '../../../../common/connectCipWallet';

export default function CoinSelection() {
  return (
    <SectionTwoCol
      sidebarTo="coinSelection"
      header="Coin selection"
      leftFn={Left()}
      rightFn={Right()}
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
  codeSnippet2 += `  'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc172555274d657368546f6b656e',\n`;
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
  codeKeepRelevant += `  'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc172555274d657368546f6b656e',\n`;
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
      <p>There are three coin selection algorithms:</p>
      <ul>
        <li>Keep Relevant</li>
        <li>Largest First</li>
        <li>Largest First Multi-Asset</li>
      </ul>
      <h3>Keep Relevant</h3>
      <p>
        <code>keepRelevant</code> is a two steps coin selection algorithm. First
        it tries to eliminate all the irrelevant UTxOs from the initial
        UTxOs set. Then, it will check if we have enough lovelace to cover all
        the multiassts we got in our UTxO selection; if the selected UTxOs
        doesn't have enough lovelace, it will try to pickup the largest lovelace
        UTxO from the wallet.
      </p>
      <Codeblock data={codeKeepRelevantDesc} isJson={false} />
      <p>
        Here is an example how you can use <code>keepRelevant()</code>:
      </p>
      <Codeblock data={codeKeepRelevant} isJson={false} />

      <h3>Largest First</h3>
      <p>
        To select UTXOs for transaction that only requires lovelace, use{' '}
        <code>largestFirst</code>.
      </p>
      <Codeblock data={code3} isJson={false} />
      <p>For example, selecting the UTXOs for sending 10000000 lovelace:</p>
      <Codeblock data={codeSnippet1} isJson={false} />

      <h3>Largest First Multi-Asset</h3>
      <p>
        <code>largestFirstMultiAsset</code> allows you to select native assets
        by defining a <code>Map</code> of required assets.
      </p>
      <Codeblock data={code4} isJson={false} />
      <p>
        Although you have use this to specify require lovelace to fulfill this
        transaction, but if your transaction only required lovelace, the
        algorithm will exclude all multiasset utxo from the selection, thus you
        could select the required UTXOs more efficiently.
      </p>
      <Codeblock data={codeSnippet2} isJson={false} />
      <p>
        The third parameter, <code>includeTxFees</code>, if <code>True</code>,
        Mesh will calculate the fees required, and include additional UTXOs to
        fulfill the fees amount.
      </p>
    </>
  );
}

function Right() {
  // const [state, setState] = useState<number>(0);
  // const [response, setResponse] = useState<null | any>(null);
  // const [responseError, setResponseError] = useState<null | any>(null);
  // const { wallet, connected } = useWallet();

  // async function runDemo() {
  //   console.log(111, keepRelevant);
  //   console.log(222, largestFirstMultiAsset);

  //   setState(1);
  //   setResponseError(null);

  //   const utxos = await wallet.getUtxos();
  //   console.log('all utxos', utxos);
  //   const assetMap = new Map<Unit, Quantity>();
  //   assetMap.set(
  //     'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc172555274d657368546f6b656e',
  //     '1'
  //   );
  //   // assetMap.set(
  //   //   'lovelace',
  //   //   '10000000'
  //   // );
  //   // const selectedUtxos = largestFirstMultiAsset(assetMap, utxos, true);
  //   const selectedUtxos = keepRelevant(assetMap, utxos);

  //   console.log('selectedUtxos', selectedUtxos);

  //   try {
  //     setState(2);
  //   } catch (error) {
  //     setResponseError(`${error}`);
  //     setState(0);
  //   }
  // }

  return (
    <>
      {/* <ConnectCipWallet />
      <button onClick={() => runDemo()}>test</button> */}
    </>
  );
}
