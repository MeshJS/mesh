import {
  AppWallet,
  Transaction,
  ForgeScript,
  BlockfrostProvider,
  resolveTxHash,
} from '@martifylabs/mesh';
import type { Mint, AssetMetadata } from '@martifylabs/mesh';

import { metadata } from './metadata.js';
import { recipients } from './recipients.js';

const demoCLIKey = {
  paymentSkey:
    '5820aaca553a7b95b38b5d9b82a5daa7a27ac8e34f3cf27152a978f4576520dd6503',
  stakeSkey:
    '582097c458f19a3111c3b965220b1bef7d548fd75bc140a7f0a4f080e03cce604f0e',
};

const networkId = 0;
const blockfrostKey = 'BLOCKFROST_KEY_HERE';

async function main() {
  try {
    const blockchainProvider = new BlockfrostProvider(blockfrostKey);

    // load wallet
    const wallet = new AppWallet({
      networkId: networkId,
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      key: {
        type: 'cli',
        payment: demoCLIKey.paymentSkey,
        stake: demoCLIKey.stakeSkey,
      },
    });

    // get forging script
    const walletAddress = wallet.getPaymentAddress();
    const forgingScript = ForgeScript.withOneSignature(walletAddress);

    // build transaction
    const tx = new Transaction({ initiator: wallet });
    for (let recipient in recipients) {
      const recipientAddress = recipient;
      const assetName = recipients[recipient];
      const assetMetadata: AssetMetadata = metadata[assetName];
      const asset: Mint = {
        assetName: assetName,
        assetQuantity: '1',
        metadata: assetMetadata,
        label: '721',
        recipient: {
          address: recipientAddress,
        },
      };
      tx.mintAsset(forgingScript, asset);
    }

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx, false);

    // uncomment this to submit the tx
    // const txHash = await wallet.submitTx(signedTx);
    // console.log("txHash", txHash);

    // for this example, we just `resolveTxHash` to get the txHash
    const hash = resolveTxHash(signedTx);
    console.log('hash', hash);
  } catch (e) {
    console.log('error', e);
  }
}

if (blockfrostKey != 'BLOCKFROST_KEY_HERE') {
  await main();
}
