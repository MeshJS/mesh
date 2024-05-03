import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useEffect, useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { asset, getContract, price } from './common';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import Input from '../../../ui/input';

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
  let code = `async marketplace.purchaseAsset(\n`;
  code += `  address: string,\n`;
  code += `  asset: string,\n`;
  code += `  price: number\n`;
  code += `)`;
  return (
    <>
      <p>
        Purchase a listed asset from the marketplace. The seller will receive
        the listed price in ADA and the buyer will receive the asset.
      </p>
      <Codeblock data={code} isJson={false} />
      <p>
        <code>address</code> is the seller's address. <code>asset</code> is the
        listed asset's <code>unit</code>. <code>price</code> is the listed price
        in Lovelace.
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
    'mesh_marketplace_demo',
    {}
  );
  const [listPrice, updateListPrice] = useState<number>(price);
  const [sellerAddress, updateSellerAddress] =
    useState<string>('SELLER ADDRESS');

  let code1 = ``;
  code1 += `const txHash = await marketplace.purchaseAsset(\n`;
  code1 += `  '${sellerAddress}',\n`;
  code1 += `  '${asset}',\n`;
  code1 += `  ${listPrice}\n`;
  code1 += `);\n`;

  useEffect(() => {
    if (userLocalStorage.listPrice) {
      updateListPrice(userLocalStorage.listPrice);
    }
    if (userLocalStorage.sellerAddress) {
      updateSellerAddress(userLocalStorage.sellerAddress);
    }
  }, []);

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract(wallet);

      console.log(3, userLocalStorage);
      const utxo = await contract.getUtxoByTxHash(userLocalStorage);

      if (!utxo) {
        setResponseError('Input utxo not found');
        setLoading(false);
        return;
      }

      const tx = await contract.purchaseAsset(utxo);
      const signedTx = await wallet.signTx(tx, true);
      const txHash = await wallet.submitTx(signedTx);
      console.log(4, txHash);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <Card>
      <Codeblock data={code1} isJson={false} />
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
