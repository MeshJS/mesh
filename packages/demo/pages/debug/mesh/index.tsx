import { MeshWallet, BlockfrostProvider } from '@meshsdk/core';

/**
 *
 */

export default function Mesh() {
  async function getWallet() {
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

  async function getBalance() {
    const wallet = await getWallet();
    const getBalance = await wallet.getBalance();
    console.log('getBalance', getBalance);
  }

  async function getChangeAddress() {
    const wallet = await getWallet();
    const getChangeAddress = await wallet.getChangeAddress();
    console.log('getChangeAddress', getChangeAddress);
  }

  async function getNetworkId() {
    const wallet = await getWallet();
    const getNetworkId = await wallet.getNetworkId();
    console.log('getNetworkId', getNetworkId);
  }

  async function getRewardAddresses() {
    const wallet = await getWallet();
    const getRewardAddresses = await wallet.getRewardAddresses();
    console.log('getRewardAddresses', getRewardAddresses);
  }

  return (
    <>
      <div className="flex gap-4 m-4">
        <button onClick={() => getWallet()}>getWallet</button>
        <button onClick={() => getBalance()}>getBalance</button>
        <button onClick={() => getChangeAddress()}>getChangeAddress</button>
        <button onClick={() => getNetworkId()}>getNetworkId</button>
        <button onClick={() => getRewardAddresses()}>getRewardAddresses</button>
      </div>
    </>
  );
}
