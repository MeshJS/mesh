import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
// import useMarketplaceV1 from '../../../../hooks/useMarketplaceV1';
import Button from '../../../ui/button';
import { useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { BlockfrostProvider } from '@meshsdk/core';
// import useLocalStorage from '../../../../hooks/useLocalStorage';
import { getMarketplace, asset, price } from './config';
import { BasicMarketplace } from '@meshsdk/contracts';

// const blockfrostProvider = new BlockfrostProvider(
//   process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
// );

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
  // const { listAsset } = useMarketplaceV1({
  //   blockchainFetcher: blockfrostProvider,
  //   network: 0,
  // });
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  // const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
  //   'meshUseMarketplaceV1',
  //   {}
  // );

  let code1 = ``;

  // async function rundemo() {
  //   setLoading(true);
  //   setResponse(null);
  //   setResponseError(null);

  //   try {
  //     const marketplace = getMarketplace(wallet);
  //     const address = (await wallet.getUsedAddresses())[0];
  //     const txHash = await marketplace.listAsset(address, asset, price);
  //     setResponse(txHash);
  //   } catch (error) {
  //     setResponseError(`${error}`);
  //   }
  //   setLoading(false);
  // }

  // async function rundemo_v1() {
  //   setLoading(true);
  //   setResponse(null);
  //   setResponseError(null);

  //   try {
  //     const policyId =
  //       'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc17255527';
  //     const assetId = '4d657368546f6b656e';
  //     const listPriceInLovelace = 10000000;
  //     const quantity = 1;
  //     const txHash = await listAsset({
  //       policyId,
  //       assetId,
  //       listPriceInLovelace,
  //       quantity,
  //     });
  //     setResponse(txHash);

  //     const sellerAddress = (await wallet.getUsedAddresses())[0];
  //     setUserlocalStorage({
  //       sellerAddress,
  //       policyId,
  //       assetId,
  //       listPriceInLovelace,
  //       quantity,
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

    const blockchainProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
    );

      const marketplace = new BasicMarketplace({
        fetcher: blockchainProvider,
        initiator: wallet,
        network: 'preprod',
        signer: wallet,
        submitter: blockchainProvider,
        percentage: 25000, // 2.5%
        owner: 'addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr',
      });
      console.log('marketplace', marketplace);

    const address = await wallet.getChangeAddress();
    const policyId =
      'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc17255527';
    const assetId = '4d657368546f6b656e';
    const price = 10000000;

    const txHash = await marketplace.listAsset(
      address,
      policyId + assetId,
      price
    );

    setResponse(txHash);
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
