import { MeshEscrowContract } from '@meshsdk/contracts';
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';

export function getContract(wallet) {
  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
  });

  const contract = new MeshEscrowContract({
    mesh: meshTxBuilder,
    fetcher: blockchainProvider,
    wallet: wallet,
    networkId: 0,
  });

  return contract;
}
