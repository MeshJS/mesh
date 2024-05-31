import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { MeshSwapContract } from '@meshsdk/contracts';
import useLocalStorage from '../../../../hooks/useLocalStorage';

export default function SwapCancelSwap() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="cancelSwap"
        header="Cancel Swap"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  return (
    <>
      <p>Any any time before swap is accepted, user A can cancel the swap.</p>
      <p>
        <code>cancelSwap()</code> cancel a swap. The function accepts the
        following parameters:
      </p>
      <ul>
        <li>
          <b>swapUtxo (UTxO)</b> - the utxo of the transaction in the script
          for the swap
        </li>
      </ul>
      <p>
        The function accepts a swap transaction hash and returns a transaction
        hash if the swap is successfully accepted.
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

      const utxo = await contract.getUtxoByTxHash(userLocalStorage);
      if (!utxo) {
        setResponseError('Input utxo not found');
        setLoading(false);
        return;
      }

      const tx = await contract.cancelSwap(utxo);

      const signedTx = await wallet.signTx(tx, true);
      const txHash = await wallet.submitTx(signedTx);

      setUserlocalStorage(txHash);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash(txHashToSearchFor);\n`;
  code += `if (!utxo) {\n`;
  code += `  setResponseError('Input utxo not found');\n`;
  code += `  setLoading(false);\n`;
  code += `  return;\n`;
  code += `}\n`;
  code += `\n`;
  code += `const tx = await contract.cancelSwap(utxo);\n`;
  code += `\n`;
  code += `const signedTx = await wallet.signTx(tx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <Card>
      <p>Any any time before swap is accepted, user A can cancel the swap.</p>
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
            Cancel Swap
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
