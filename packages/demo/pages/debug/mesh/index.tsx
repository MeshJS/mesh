import {
  MeshWallet,
  BlockfrostProvider,
  YaciProvider,
  Transaction,
} from '@meshsdk/core';
import { ForgeScript } from '@meshsdk/core';
import type { Mint, AssetMetadata } from '@meshsdk/core';
import { MeshTxBuilder } from '@meshsdk/core';
import { MeshEscrowContract } from '@meshsdk/contracts';

export default function Mesh() {
  function getBlockchainProvider() {
    // const blockchainProvider = new BlockfrostProvider(
    //   process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
    // );
    const blockchainProvider = new YaciProvider('http://localhost:8080/api/v1');
    return blockchainProvider;
  }

  async function getMeshWallet() {
    const blockchainProvider = getBlockchainProvider();
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
    const signature = await wallet.signData('mesh');
    console.log('signData', signature);
  }

  async function signTx() {
    const wallet = await getMeshWallet();

    // simple tx

    // const tx = new Transaction({ initiator: wallet }).sendLovelace(
    //   'addr_test1qp2k7wnshzngpqw0xmy33hvexw4aeg60yr79x3yeeqt3s2uvldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmysdp6yv3',
    //   '5000000'
    // );
    // const unsignedTx = await tx.build();
    // const signedTx = await wallet.signTx(unsignedTx);
    // const txHash = await wallet.submitTx(signedTx);
    // console.log('signTx', txHash);

    // minting

    // prepare forgingScript
    const usedAddress = await wallet.getUsedAddresses();
    const address = usedAddress[0];
    const forgingScript = ForgeScript.withOneSignature(address);

    const tx = new Transaction({ initiator: wallet });

    // define asset#1 metadata
    const assetMetadata1: AssetMetadata = {
      name: 'Mesh Token',
      image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
      mediaType: 'image/jpg',
      description: 'This NFT was minted by Mesh (https://meshjs.dev/).',
    };
    const asset1: Mint = {
      assetName: 'MeshToken',
      assetQuantity: '1',
      metadata: assetMetadata1,
      label: '721',
      recipient:
        'addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr',
    };
    tx.mintAsset(forgingScript, asset1);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    console.log(1, txHash);
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
    const getPolicyIdAssets = await wallet.getPolicyIdAssets(
      'bc63b6d09c843439c476e5f50303e5898568e90398be1d30d67b3aa8'
    );
    console.log('getPolicyIdAssets', getPolicyIdAssets);
  }

  async function createCollateral() {
    const wallet = await getMeshWallet();
    const createCollateral = await wallet.createCollateral();
    console.log('createCollateral', createCollateral);
  }

  async function testSmartContract() {
    const wallet = await getMeshWallet();

    const blockchainProvider = getBlockchainProvider();

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

    // initiateEscrow

    // const escrowAmount = [
    //   {
    //     unit: 'lovelace',
    //     quantity: '10000000',
    //   },
    // ];

    // const tx = await contract.initiateEscrow(escrowAmount);
    // const signedTx = await wallet.signTx(tx);
    // const txHash = await wallet.submitTx(signedTx);
    // console.log(1, txHash);

    // cancelEscrow
    const utxo = await contract.getUtxoByTxHash(
      // note, must change this to the txhash of the previous tx
      'f40f880e1571b332c426ba2769e98a62aa13446e66fe876eaf94724a0b53643a'
    );
    const tx = await contract.cancelEscrow(utxo);
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    console.log(1, txHash);
  }

  return (
    <>
      <div className="flex flex-col gap-4 m-4">
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
        <button onClick={() => createCollateral()}>createCollateral</button>
        <button onClick={() => testSmartContract()}>testSmartContract</button>
      </div>
    </>
  );
}
