import Button from '../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import {
  ForgeScript,
  Transaction,
  AppWallet,
  BlockfrostProvider,
} from '@meshsdk/core';
import type { AssetMetadata, Mint } from '@meshsdk/core';
import { demoMnemonic } from '../../configs/demo';
import RunDemoResult from './runDemoResult';

export default function MintMeshToken() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

  async function runMint() {
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
        description: 'This NFT was minted by Mesh (https://meshjs.dev/).',
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
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <>
      {connected ? (
        <>
          <Button
            onClick={() => runMint()}
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
          <RunDemoResult response={responseError} />
        </>
      ) : (
        <CardanoWallet />
      )}
    </>
  );
}
