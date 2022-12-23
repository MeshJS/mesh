import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import { largestFirstMultiAsset } from '@meshsdk/core';
import type { Unit, Quantity } from '@meshsdk/core';

export default function CoinSelection() {
  return (
    <SectionTwoCol
      sidebarTo="coinSelection"
      header="Coin Selection"
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

  return (
    <>
      <p>
        There are two coin selection algorithm, one for selecting lovelace,
        another for selecting multiple assets.
      </p>
      <p>
        To select UTXOs for transaction that only requires lovelace, use{' '}
        <code>largestFirst</code>.
      </p>
      <Codeblock data={code3} isJson={false} />
      <p>For example, selecting the UTXOs for sending 10000000 lovelace:</p>
      <Codeblock data={codeSnippet1} isJson={false} />
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
  const [state, setState] = useState<number>(0);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const { wallet, connected } = useWallet();

  async function runDemo() {
    setState(1);
    setResponseError(null);

    const utxos = await wallet.getUtxos();
    console.log('all utxos', utxos);
    const assetMap = new Map<Unit, Quantity>();
    assetMap.set(
      'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc172555274d657368546f6b656e',
      // '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e',
      '1'
    );
    // assetMap.set(
    //   'lovelace',
    //   '10000000'
    // );
    const selectedUtxos = largestFirstMultiAsset(assetMap, utxos, true);
    console.log('selectedUtxos', selectedUtxos);

    try {
      setState(2);
    } catch (error) {
      setResponseError(`${error}`);
      setState(0);
    }
  }

  return <></>;
}
