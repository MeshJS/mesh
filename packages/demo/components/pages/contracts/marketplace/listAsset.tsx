import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import { asset, getContract, price } from './common';
import Input from '../../../ui/input';

export default function MarketplaceListAsset() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="listAsset"
        header="List Asset"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  let code = ``;
  code += `const tx = await contract.listAsset('${asset}', 10000000);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        List an asset on the marketplace. This will allow other users to buy the
        asset. The seller will receive the listing price in ADA. The seller can
        cancel the listing at any time. The seller can also update the listing
        price at any time.
      </p>
      <p>
        <code>address</code> is the seller's address, here we use the first Used
        Addresses of the connected wallet. <code>asset</code> is the asset's{' '}
        <code>unit</code> to be listed. <code>price</code> is the listing price
        in Lovelace.
      </p>
      <Codeblock data={code} isJson={false} />
      <p>
        It is important to save the listing infomation (asset, seller address
        and listing price) in a database. This is needed to
        update/cancel/purchase the listing.
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

  // async function rundemo() {
  //   setLoading(true);
  //   setResponse(null);
  //   setResponseError(null);

  //   try {
  //     const marketplace = getMarketplace(wallet);
  //     const address = (await wallet.getUsedAddresses())[0];
  //     const txHash = await marketplace.listAsset(address, asset, price);
  //     setResponse(txHash);

  //     setUserlocalStorage({
  //       sellerAddress: address,
  //       listPrice: price,
  //     });
  //   } catch (error) {
  //     setResponseError(`${error}`);
  //   }
  //   setLoading(false);
  // }

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract(wallet);

      const tx = await contract.listAsset(asset, listPrice);
      const signedTx = await wallet.signTx(tx);
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
        value={listPrice}
        onChange={(e) => updateListPrice(e.target.value)}
        placeholder="Listing price in Lovelace"
        label="Listing price in Lovelace"
      />
      {connected ? (
        <>
          <Button
            onClick={() => rundemo()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            List Mesh Token
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
