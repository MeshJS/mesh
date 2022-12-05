import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import useMarketplaceV1 from '../../../../hooks/useMarketplaceV1';
import Button from '../../../ui/button';
import { useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { BlockfrostProvider } from '@meshsdk/core';
import useLocalStorage from '../../../../hooks/useLocalStorage';

const blockfrostProvider = new BlockfrostProvider(
  process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
);

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
  return (
    <>
      <p>Update Price</p>
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const { updateListing } = useMarketplaceV1({
    blockchainFetcher: blockfrostProvider,
    network: 0,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'meshUseMarketplaceV1',
    {}
  );

  let code1 = ``;

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    console.log('userLocalStorage', userLocalStorage, userLocalStorage.assetId);

    try {
      const txHash = await updateListing({
        policyId: userLocalStorage.policyId,
        assetId: userLocalStorage.assetId,
        listPriceInLovelace: userLocalStorage.listPriceInLovelace,
        quantity: userLocalStorage.quantity,
        updatedPriceInLovelace: userLocalStorage.listPriceInLovelace + 5000000,
      });

      setUserlocalStorage({
        sellerAddress: userLocalStorage.sellerAddress,
        policyId: userLocalStorage.policyId,
        assetId: userLocalStorage.assetId,
        listPriceInLovelace: userLocalStorage.listPriceInLovelace + 5000000,
        quantity: userLocalStorage.quantity,
      });

      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <Card>
      <Codeblock data={code1} isJson={false} />
      {connected && (
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
      )}
      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}
