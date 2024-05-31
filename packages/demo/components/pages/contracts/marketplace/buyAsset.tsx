import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { getContract } from './common';
import useLocalStorage from '../../../../hooks/useLocalStorage';

export default function MarketplaceBuyAsset() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="buyAsset"
        header="Buy Asset"
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
        Purchase a listed asset from the marketplace. The seller will receive
        the listed price in ADA and the buyer will receive the asset. The
        marketplace owner will receive a fee if it is specified.
      </p>
      <p>
        <code>purchaseAsset()</code> purchase a listed asset. The function
        accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>utxo (UTxO)</b> - unspent transaction output in the script
        </li>
      </ul>
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'mesh_marketplace_demo',
    {}
  );

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract(wallet);

      const utxo = await contract.getUtxoByTxHash(userLocalStorage);

      if (!utxo) {
        setResponseError('Input utxo not found');
        setLoading(false);
        return;
      }

      const tx = await contract.purchaseAsset(utxo);
      console.log(1, 'tx', tx);
      const signedTx = await wallet.signTx(tx, true);
      console.log(2, 'signedTx', signedTx);
      const txHash = await wallet.submitTx(signedTx); // hinson todo
      console.log(3, 'txHash', txHash);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash(txHashToSearchFor);\n`;
  code += `const tx = await contract.purchaseAsset(utxo);\n`;
  code += `const signedTx = await wallet.signTx(tx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <Card>
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
            Purchase Listed Mesh Token
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
