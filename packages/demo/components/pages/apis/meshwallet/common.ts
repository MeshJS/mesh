import { BlockfrostProvider, MeshWallet } from '@meshsdk/core';

export function getMeshWallet() {
  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );
  const wallet = new MeshWallet({
    networkId: 0,
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
    key: {
      type: 'mnemonic',
      words: [
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
        'solution',
      ],
    },
  });
  return wallet;
}
