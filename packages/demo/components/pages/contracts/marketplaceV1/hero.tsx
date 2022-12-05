import { ShoppingCartIcon } from '@heroicons/react/24/solid';
import {
  ForgeScript,
  Transaction,
  AppWallet,
  BlockfrostProvider,
} from '@meshsdk/core';
import type { AssetMetadata, Mint } from '@meshsdk/core';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import Button from '../../../ui/button';
import Card from '../../../ui/card';
import { useState } from 'react';
import { demoMnemonic } from '../../../../configs/demo';
import RunDemoResult from '../../../common/runDemoResult';

export default function Hero() {
  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <ShoppingCartIcon className="w-16 h-16" />
            </div>
            <span>Marketplace</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          This marketplace allows anyone to buy and sell native assets such as
          NFTs.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            The marketplace smart contract allows users to buy and sell NFTs. A
            seller list an NFT for sales by specifying a certain price, and
            anyone can buy it by paying the demanded price.
          </p>
          <p>
            There are 4 actions (or endpoints) available to interact with this
            smart contract; 1) list asset, 2) buy asset, 3) updating listing,
            and 4) cancel listing.
          </p>
          <p>
            The marketplace can be configured to allow all policy IDs or only
            allow certain policy IDs to be listed.
          </p>
          <p className="font-medium">
            This page explains and show how it works and how it can be used.
          </p>
          <Demo />
        </div>
      </div>
    </>
  );
}

function Demo() {
  const { wallet, connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function mintMeshToken() {
    setLoading(true);
    try {
      const blockchainProvider = new BlockfrostProvider(
        process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
      );

      const mintingWallet = new AppWallet({
        networkId: 0,
        fetcher: blockchainProvider,
        submitter: blockchainProvider,
        key: {
          type: 'mnemonic',
          words: demoMnemonic,
        },
      });

      const usedAddress = await wallet.getUsedAddresses();
      const address = usedAddress[0];
      const forgingScript = ForgeScript.withOneSignature(
        mintingWallet.getPaymentAddress()
      );

      const tx = new Transaction({ initiator: wallet });

      const assetMetadata: AssetMetadata = {
        name: 'Mesh Token',
        image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
        mediaType: 'image/jpg',
        description: 'This NFT is minted by Mesh (https://meshjs.dev/).',
      };
      const asset: Mint = {
        assetName: 'MeshToken',
        assetQuantity: '1',
        metadata: assetMetadata,
        label: '721',
        recipient: address,
      };
      tx.mintAsset(forgingScript, asset);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx, true);
      const signedTx2 = await mintingWallet.signTx(signedTx, true);
      const txHash = await wallet.submitTx(signedTx2);
      setResponse(txHash);
    } catch (error) {}
    setLoading(false);
  }

  return (
    <Card>
      <h3>Try the demo</h3>
      <p>You can test this martetplace smart contract on this page.</p>
      <p>
        Firstly, switch your wallet network to one of the testnets, and connect
        wallet.
      </p>
      <CardanoWallet />
      {connected && (
        <>
          <p>Next, mint a Mesh Token. We will use list this NFT for sale.</p>
          <Button
            onClick={() => mintMeshToken()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            Mint Mesh Token
          </Button>
          {response !== null && (
            <>
              <p>Mesh token minted successful.</p>
              <RunDemoResult response={response} label="Transaction hash" />
            </>
          )}
        </>
      )}
    </Card>
  );
}
