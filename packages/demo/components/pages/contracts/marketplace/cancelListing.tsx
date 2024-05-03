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

export default function MarketplaceCancelAsset() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="cancelListing"
        header="Cancel Listing"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  let code = `async marketplace.delistAsset(\n`;
  code += `  address: string,\n`;
  code += `  asset: string,\n`;
  code += `  price: number\n`;
  code += `)`;
  return (
    <>
      <p>
        Cancel a listing on the marketplace. The seller can cancel the listing
        at any time. The seller will receive the listed asset back.
      </p>
      <p>
        <code>address</code> is the seller's address. <code>asset</code> is the
        listed asset's <code>unit</code>. <code>price</code> is the listed price
        in Lovelace.
      </p>
      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'meshMarketplaceDemo',
    {}
  );

  const [listPrice, updateListPrice] = useState<number>(price);
  const [sellerAddress, updateSellerAddress] =
    useState<string>('SELLER ADDRESS');

  let code1 = ``;
  code1 += `const txHash = await marketplace.delistAsset(\n`;
  code1 += `  '${sellerAddress}',\n`;
  code1 += `  '${asset}',\n`;
  code1 += `  ${listPrice}\n`;
  code1 += `);`;

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

    // try {
    //   const marketplace = getMarketplace(wallet);
    //   const txHash = await marketplace.delistAsset(
    //     sellerAddress,
    //     asset,
    //     listPrice
    //   );
    //   setResponse(txHash);
    // } catch (error) {
    //   setResponseError(`${error}`);
    // }
    setLoading(false);
  }

  return (
    <Card>
      <Input
        value={sellerAddress}
        onChange={(e) => updateSellerAddress(e.target.value)}
        placeholder="Seller address"
        label="Seller address"
      />
      <Input
        value={listPrice}
        onChange={(e) => updateListPrice(e.target.value)}
        placeholder="Listing price in Lovelace"
        label="Listing price in Lovelace"
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
            Cancel listing
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
