// import { BasicMarketplace } from '@meshsdk/contracts';
// import { BlockfrostProvider } from '@meshsdk/core';

import { MeshMarketplaceContract } from '@meshsdk/contracts';
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';

// export function getMarketplace(wallet) {
//   const blockchainProvider = new BlockfrostProvider(
//     process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
//   );

//   const marketplace = new BasicMarketplace({
//     fetcher: blockchainProvider,
//     initiator: wallet,
//     network: 'preprod',
//     signer: wallet,
//     submitter: blockchainProvider,
//     percentage: 25000, // 2.5%
//     owner: 'addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr',
//   });

//   return marketplace;
// }

const policyId = 'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc17255527';
const assetId = '4d657368546f6b656e';
export const asset = policyId + assetId;
export const price = 10000000;

export function getContract(wallet) {
  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
  });

  const contract = new MeshMarketplaceContract(
    {
      mesh: meshTxBuilder,
      fetcher: blockchainProvider,
      wallet: wallet,
      networkId: 0,
    },
    'addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9',
    200
  );

  return contract;
}
