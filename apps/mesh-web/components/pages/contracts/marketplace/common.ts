import { MeshMarketplaceContract } from '@meshsdk/contracts';
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { assetAsset, demoAddresses } from '../../../../configs/demo';

export const asset = assetAsset;
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
    demoAddresses.testnet,
    200 // 2% fee
  );

  return contract;
}
