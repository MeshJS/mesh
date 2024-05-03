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

export default function MarketplaceUpdateListing() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="updateListing"
        header="Update Listing"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  let code = `async marketplace.relistAsset(\n`;
  code += `  address: string,\n`;
  code += `  asset: string,\n`;
  code += `  oldPrice: number\n`;
  code += `  newPrice: number\n`;
  code += `)`;

  return (
    <>
      <p>
        Update a listing on the marketplace. For the contract, the seller can
        update the listing price.
      </p>
      <p>
        <code>address</code> is the seller's address. <code>asset</code> is the
        listed asset's <code>unit</code>. <code>oldPrice</code> is the listed
        price in Lovelace. <code>newPrice</code> is the updated listed price in
        Lovelace.
      </p>
      <Codeblock data={code} isJson={false} />
      <p>It is important to update the updated listing price in a database.</p>
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
  const [newListPrice, updateNewListPrice] = useState<number>(20000000);

  let code1 = ``;
  // code1 += `const txHash = await marketplace.relistAsset(\n`;
  // code1 += `  '${sellerAddress}',\n`;
  // code1 += `  '${asset}',\n`;
  // code1 += `  ${listPrice},\n`;
  // code1 += `  ${newListPrice}\n`;
  // code1 += `);\n`;

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

      const tx = await contract.relistAsset(utxo, newListPrice);
      const signedTx = await wallet.signTx(tx, true);
      const txHash = await wallet.submitTx(signedTx);
      setUserlocalStorage(txHash);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <Card>
      <Input
        value={newListPrice}
        onChange={(e) => updateNewListPrice(e.target.value)}
        placeholder="New listing price in Lovelace"
        label="New listing price in Lovelace"
      />

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
            Update listing
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
