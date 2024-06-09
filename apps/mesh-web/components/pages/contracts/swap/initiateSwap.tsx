import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { Asset, BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { MeshSwapContract } from '@meshsdk/contracts';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import { assetAsset } from '../../../../configs/demo';

export default function SwapInitiateSwap() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="initiateSwap"
        header="Initiate Swap"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
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
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'mesh_swap_demo',
    undefined
  );

  function getContract() {
    const blockchainProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
    );

    const meshTxBuilder = new MeshTxBuilder({
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
    });

    const contract = new MeshSwapContract({
      mesh: meshTxBuilder,
      fetcher: blockchainProvider,
      wallet: wallet,
    });

    return contract;
  }

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract();

      const assetToProvide: Asset = {
        unit: 'lovelace',
        quantity: '10000000',
      };

      const assetToReceive: Asset = {
        unit: assetAsset,
        quantity: '1',
      };

      const tx = await contract.initiateSwap(
        [assetToProvide],
        [assetToReceive]
      );

      const signedTx = await wallet.signTx(tx);
      const txHash = await wallet.submitTx(signedTx);

      setUserlocalStorage(txHash);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code = ``;
  code += `const assetToProvide: Asset = {\n`;
  code += `  unit: 'lovelace',\n`;
  code += `  quantity: '10000000',\n`;
  code += `};\n`;
  code += `\n`;
  code += `const assetToReceive: Asset = {\n`;
  code += `  unit: '${assetAsset}',\n`;
  code += `  quantity: '1',\n`;
  code += `};\n`;
  code += `\n`;
  code += `const tx = await contract.initiateSwap(\n`;
  code += `  [assetToProvide],\n`;
  code += `  [assetToReceive]\n`;
  code += `);\n`;
  code += `\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <Card>
      <p>
        In this demo, user A is initiating a swap by providing 10 ADA to the
        swap for a Mesh Token.
      </p>
      <Codeblock data={code} isJson={false} />
      {connected ? (
        <>
          <Button
            onClick={() => rundemo()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            Initiate Swap
          </Button>
          <RunDemoResult response={response} />
        </>
      ) : (
        <CardanoWallet />
      )}
      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}
