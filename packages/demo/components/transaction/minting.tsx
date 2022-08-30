import { useState, useEffect } from 'react';
import { Button, Card, Codeblock, Input, Toggle } from '../../components';
import useWallet from '../../contexts/wallet';
import ConnectWallet from '../wallet/connectWallet';
import { Transaction, resolveKeyHash, ForgeScript } from '@martifylabs/mesh';
import type { AssetRaw, AssetMetadata } from '@martifylabs/mesh';

const myencryptedRootKey =
  'abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef888811abcdef88881119ee4461d9bba1a1f873b9b98a98ea63ae6fa11b600938d4efb100650d2cea5d4bd187d713494f422801bb477d67bc83b6fdb084f4dd3db731c81d42e22bfabd1285fbf5b4ea12d03d4a7233ec889beb32ed38ad7ec28c65ff56a69f43c0c9ec3cdb211339809221d538d222d204f104';
const mypassword = '12345678';

export default function Minting() {
  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Minting</h3>
          <p></p>
        </div>
        <div className="mt-8">
          <CodeDemo />
        </div>
      </div>
    </Card>
  );
}

function CodeDemo() {
  const { wallet, walletConnected } = useWallet();

  const [state, setState] = useState<number>(0);

  async function makeTransactionMinting() {
    try {
      console.log('makeTransactionMinting');

      // wallet

      const address = 'addr_test1qz8p7er75le6gxjkd4cgrvn9a5fspus4vtdyv6l2etj4qeq636sfudakhsh65qggs4ttjjsk8fuu3fkd65uaxcxv0tfq43ddah';
      console.log("keyHash", resolveKeyHash(address));
      const forgingScript = ForgeScript.requireOneSignature(address);
      console.log("forgingScript", forgingScript);

      // asset

      const assetMetadata: AssetMetadata = {
        name: 'MeshNFT001',
        image: 'ipfs://Qmbw8QcgMMdUMnLxjFuxFeXZJxPioXW5WU1UJKwqZgLXNS',
        mediaType: 'image/gif',
        description: 'This is the first NFT minted by Mesh.',
      };

      const asset: AssetRaw = {
        name: 'MeshNFT001',
        quantity: '1',
        metadata: assetMetadata,
        label: '721',
      };

      // transaction

      // error UTxO Balance Insufficient

      const tx = new Transaction({ initiator: wallet });
      // to mint
      // tx.mintAsset(forgingScript, address, asset);

      // to burn
      const assetToBurn = {
        unit: '27caacc76792585193e8e4539db77ad1ed801a5942bd079e741e34364d6573684e4654303031',
        quantity: '1',
      }
      tx.burnAsset(forgingScript, assetToBurn);

      const unsignedTx = await tx.build();
      console.log('unsignedTx', unsignedTx);
      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);
      console.log('txHash', txHash);
    } catch (error) {
      console.log('error', error);
    }
  }

  return (
    <>
      {/* <Button
        onClick={() => makeTransactionMinting()}
        disabled={state == 1}
        style={state == 1 ? 'warning' : state == 2 ? 'success' : 'light'}
      >
        Run code snippet to mint asset
      </Button> */}
      {walletConnected ? (
        <Button
          onClick={() => makeTransactionMinting()}
          disabled={state == 1}
          style={state == 1 ? 'warning' : state == 2 ? 'success' : 'light'}
        >
          Run code snippet to mint asset
        </Button>
      ) : (
        <ConnectWallet />
      )}
    </>
  );
}
