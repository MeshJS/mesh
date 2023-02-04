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
  return (
    <>
      <p>List NFT</p>
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const { listAsset } = useMarketplaceV1({
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

    try {
      const policyId =
        'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc17255527';
      const assetId = '4d657368546f6b656e';
      const listPriceInLovelace = 10000000;
      const quantity = 1;
      const txHash = await listAsset({
        policyId,
        assetId,
        listPriceInLovelace,
        quantity,
      });
      setResponse(txHash);

      const sellerAddress = (await wallet.getUsedAddresses())[0];
      setUserlocalStorage({
        sellerAddress,
        policyId,
        assetId,
        listPriceInLovelace,
        quantity,
      });
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
            List NFT
          </Button>
          <RunDemoResult response={response} />
        </>
      )}
      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}
