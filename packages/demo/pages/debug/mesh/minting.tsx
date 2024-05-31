import {
  MeshWallet,
  BlockfrostProvider,
  Transaction,
  ForgeScript,
} from '@meshsdk/core';
import type { Mint, AssetMetadata } from '@meshsdk/core';
import { CardanoWallet, useWallet } from '@meshsdk/react';

export default function MeshWalletMinting() {
  const { wallet: clientWallet, connected } = useWallet();

  function getMeshWallet() {
    const blockchainProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
    );

    return new MeshWallet({
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
  }

  async function meshWalletCreateTx(recipient) {
    const meshWallet = getMeshWallet();

    const usedAddress = await meshWallet.getUsedAddresses();
    const address = usedAddress[0];
    const forgingScript = ForgeScript.withOneSignature(address);

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
      recipient: recipient,
    };

    const tx = new Transaction({ initiator: meshWallet });
    tx.mintAsset(forgingScript, asset1);
    tx.sendLovelace(address, '15000000');

    const unsignedTx = await tx.build();
    return unsignedTx;
  }

  async function meshWalletSignTx(tx) {
    const meshWallet = getMeshWallet();
    const signedTx = await meshWallet.signTx(tx, true);
    const txHash = await meshWallet.submitTx(signedTx);
    return txHash;
  }

  async function mintMeshToken() {
    const changeAddress = await clientWallet.getChangeAddress();
    const unsignedTx = await meshWalletCreateTx(changeAddress);
    const signedTx = await clientWallet.signTx(unsignedTx, true);
    const txhash = await meshWalletSignTx(signedTx);
  }

  return (
    <>
      {connected ? (
        <button onClick={() => mintMeshToken()}>mintMeshToken</button>
      ) : (
        <CardanoWallet isDark={false} />
      )}
    </>
  );
}
