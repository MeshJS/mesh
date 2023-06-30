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
      <p>There are currently three coin selection algorithms available:</p>
      <ul>
        <li>Largest First</li>
        <li>Largest First Multi-Asset</li>
        <li>Keep Relevant</li>
      </ul>
      

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
        <code>largestFirstMultiAsset</code> allows you to define which native assets
        you require for sending out by defining a <code>Map</code>.  The Map is matches
        the <code>Unit</code> (fingerprint) with the quantity of each asset.
      </p>
      <Codeblock data={code4} isJson={false} />
      <p>
        Note that if lovelace, aside from the "minimum Ada" which in any case needs to
        accompany the other assets, this must be explicitly specified.  This can also 
        be useful in the case that your transaction <em>only</em> requires transfer of
        lovelace.  In this case, the algorithm will exclude all multiasset UTxOs from 
        the selection, which can result in more efficient selection of the required UTxOs.
      </p>
      <Codeblock data={codeSnippet2} isJson={false} />
      <p>
        The third parameter is <code>includeTxFees</code>. If <code>True</code>,
        Mesh will calculate the fees required for the transaction, and include additional
        UTxOs to necessary to fulfill the fees requirements.
      </p>

      <h3>Keep Relevant</h3>
      <p>
        <code>keepRelevant</code> is a two-step coin selection algorithm. First, given
        a Map (of requested assets and respective quantities) and a set of UTxOs,
        it tries to eliminate the irrelevant UTxOs from the set.  Next, it checks that this 
        UTxO set includes enough lovelace to cover all/any multi-assets in the set.
        If the set does not include enough lovelace, then it will try to also pick
        up another UTxO from the wallet, containing the largest amount of lovelace.
      </p>
      <Codeblock data={codeKeepRelevantDesc} isJson={false} />
      <p>
        Here is an example how you can use <code>keepRelevant()</code>:
      </p>
      <Codeblock data={codeKeepRelevant} isJson={false} />
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
