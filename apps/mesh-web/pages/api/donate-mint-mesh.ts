import type { NextApiRequest, NextApiResponse } from 'next';
import {
  AppWallet,
  ForgeScript,
  Transaction,
  BlockfrostProvider,
  largestFirst,
} from '@meshsdk/core';
import type { Mint } from '@meshsdk/core';

const words = [
  'gratitude',
  'recognition',
  'thanks',
  'gratefulness',
  'indebtedness',
  'tribute',
  'admiration',
  'affection',
  'awareness',
  'commendation',
  'knowledge',
  'respect',
  'acknowledgment',
  'appreciativeness',
  'thankfulness',
  'thanksgiving',
  'respect',
  'salute',
  'honor',
  'trust',
  'tribute',
  'admire',
  'commemorate',
  'commend',
];
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const recipientAddress = req.body.recipientAddress;
  const utxos = req.body.utxos;
  const amount = req.body.amount;

  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  const appWallet = new AppWallet({
    networkId: 0,
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
    key: {
      type: 'root',
      bech32: process.env.NEXT_PUBLIC_DONATE_MESHTOKEN_WALLET!,
    },
  });

  const appWalletAddress = appWallet.getPaymentAddress();
  const forgingScript = ForgeScript.withOneSignature(appWalletAddress);

  const costLovelace = amount * 1000000;

  const assetMetadata = {
    name: 'Mesh Token of Appreciation',
    image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
    mediaType: 'image/jpg',
    description: `Thank you for supporting the development of Mesh SDK.`,
    '₳': `${amount.toString()}`,
  };

  var dt = new Date();
  var secs = dt.getSeconds() + 60 * dt.getMinutes() + 60 * 60 * dt.getHours();
  let word = words[Math.floor(Math.random() * words.length)];
  word = word.charAt(0).toUpperCase() + word.slice(1);

  const assetName = `Mesh${word}Token-${secs}`;
  const asset: Mint = {
    assetName: assetName,
    assetQuantity: '1',
    metadata: assetMetadata,
    label: '721',
    recipient: {
      address: recipientAddress,
    },
  };
  const selectedUtxos = largestFirst(costLovelace.toString(), utxos, true);

  const tx = new Transaction({ initiator: appWallet });
  tx.setTxInputs(selectedUtxos);
  tx.mintAsset(forgingScript, asset);
  tx.sendLovelace(
    process.env.NEXT_PUBLIC_DONATE_ADA_ADDRESS!,
    costLovelace.toString()
  );
  tx.setChangeAddress(recipientAddress);

  const txBuilt = await tx.build();
  const unsignedTx = await appWallet.signTx(txBuilt, true);

  res.status(200).json({ unsignedTx });
}
