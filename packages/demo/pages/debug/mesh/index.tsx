import { MeshWallet, BlockfrostProvider, Transaction } from '@meshsdk/core';

/**
 *
 */

export default function Mesh() {
  async function getMeshWallet() {
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
    const wallet = await getMeshWallet();
    const getBalance = await wallet.getBalance();
    console.log('getBalance', getBalance);
  }

  async function getChangeAddress() {
    const wallet = await getMeshWallet();
    const getChangeAddress = await wallet.getChangeAddress();
    console.log('getChangeAddress', getChangeAddress);
  }

  async function getNetworkId() {
    const wallet = await getMeshWallet();
    const getNetworkId = await wallet.getNetworkId();
    console.log('getNetworkId', getNetworkId);
  }

  async function getRewardAddresses() {
    const wallet = await getMeshWallet();
    const getRewardAddresses = await wallet.getRewardAddresses();
    console.log('getRewardAddresses', getRewardAddresses);
  }

  async function getUnusedAddresses() {
    const wallet = await getMeshWallet();
    const getUnusedAddresses = await wallet.getUnusedAddresses();
    console.log('getUnusedAddresses', getUnusedAddresses);
  }

  async function getUsedAddresses() {
    const wallet = await getMeshWallet();
    const getUsedAddresses = await wallet.getUsedAddresses();
    console.log('getUsedAddresses', getUsedAddresses);
  }

  async function getUtxos() {
    const wallet = await getMeshWallet();
    const getUtxos = await wallet.getUtxos();
    console.log('getUtxos', getUtxos);
  }

  async function signData() {
    const wallet = await getMeshWallet();
    const addresses = await wallet.getUsedAddresses();
    const signature = await wallet.signData(addresses[0], 'mesh');
    console.log('signData', signature);
  }

  async function signTx() {
    const wallet = await getMeshWallet();

    const tx = new Transaction({ initiator: wallet }).sendLovelace(
      'addr_test1qp2k7wnshzngpqw0xmy33hvexw4aeg60yr79x3yeeqt3s2uvldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmysdp6yv3',
      '5000000'
    );
    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    console.log('signTx', txHash);
  }

  async function getAssets() {
    const wallet = await getMeshWallet();
    const getAssets = await wallet.getAssets();
    console.log('getAssets', getAssets);
  }

  async function getLovelace() {
    const wallet = await getMeshWallet();
    const getLovelace = await wallet.getLovelace();
    console.log('getLovelace', getLovelace);
  }

  async function getPolicyIds() {
    const wallet = await getMeshWallet();
    const getPolicyIds = await wallet.getPolicyIds();
    console.log('getPolicyIds', getPolicyIds);
  }

  async function getPolicyIdAssets() {
    const wallet = await getMeshWallet();
    const getPolicyIdAssets = await wallet.getPolicyIdAssets('bc63b6d09c843439c476e5f50303e5898568e90398be1d30d67b3aa8');
    console.log('getPolicyIdAssets', getPolicyIdAssets);
  }

  return (
    <>
      <div className="flex flex-col gap-4 m-4">
        <button onClick={() => getMeshWallet()}>getWallet</button>
        <button onClick={() => getBalance()}>getBalance</button>
        <button onClick={() => getChangeAddress()}>getChangeAddress</button>
        <button onClick={() => getNetworkId()}>getNetworkId</button>
        <button onClick={() => getRewardAddresses()}>getRewardAddresses</button>
        <button onClick={() => getUnusedAddresses()}>getUnusedAddresses</button>
        <button onClick={() => getUsedAddresses()}>getUsedAddresses</button>
        <button onClick={() => getUtxos()}>getUtxos</button>
        <button onClick={() => signData()}>signData</button>
        <button onClick={() => signTx()}>signTx</button>
        <button onClick={() => getAssets()}>getAssets</button>
        <button onClick={() => getLovelace()}>getLovelace</button>
        <button onClick={() => getPolicyIds()}>getPolicyIds</button>
        <button onClick={() => getPolicyIdAssets()}>getPolicyIdAssets</button>
        <button onClick={() => getAssets()}>getAssets</button>
      </div>
    </>
  );
}
