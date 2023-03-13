import { BasicMarketplace } from '@meshsdk/contracts';
import { BlockfrostProvider } from '@meshsdk/core';

export function getMarketplace(wallet) {
  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  const marketplace = new BasicMarketplace({
    fetcher: blockchainProvider,
    initiator: wallet,
    network: 'preprod',
    signer: wallet,
    submitter: blockchainProvider,
    version: 'V1',
    owner: 'addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr',
  });

  return marketplace;
}

const policyId = 'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc17255527';
const assetId = '4d657368546f6b656e';
export const asset = policyId + assetId;
export const price = '10000000';
