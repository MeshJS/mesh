import { AppWallet, KoiosProvider } from '@meshsdk/core';

export async function loadWallet() {
  const blockchainProvider = new KoiosProvider('preprod');

  const wallet = new AppWallet({
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

// export async function loadWallet() {
//   return 123
// }
