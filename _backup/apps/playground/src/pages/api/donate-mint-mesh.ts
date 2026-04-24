import type { NextApiRequest, NextApiResponse } from "next";

import {
  BlockfrostProvider,
  ForgeScript,
  MeshTxBuilder,
  MeshWallet,
  resolveScriptHash,
  stringToHex,
} from "@meshsdk/core";

const words = [
  "gratitude",
  "recognition",
  "thanks",
  "gratefulness",
  "indebtedness",
  "tribute",
  "admiration",
  "affection",
  "awareness",
  "commendation",
  "knowledge",
  "respect",
  "acknowledgment",
  "appreciativeness",
  "thankfulness",
  "thanksgiving",
  "respect",
  "salute",
  "honor",
  "trust",
  "tribute",
  "admire",
  "commemorate",
  "commend",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const recipientAddress = req.body.recipientAddress;
    const utxos = req.body.utxos;
    const amount = req.body.amount;

    const provider = new BlockfrostProvider(
      process.env.BLOCKFROST_API_KEY_MAINNET!,
    );

    const wallet = new MeshWallet({
      networkId: 1,
      fetcher: provider,
      submitter: provider,
      key: {
        type: "root",
        bech32: process.env.DONATE_MESHTOKEN_WALLET!,
      },
    });

    const walletAddress = wallet.getUsedAddresses()[0];
    const forgingScript = ForgeScript.withOneSignature(walletAddress!);

    const costLovelace = amount * 1000000;

    const assetMetadata = {
      name: "Mesh Token of Appreciation",
      image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",
      mediaType: "image/jpg",
      description: `Thank you for supporting the development of Mesh SDK.`,
      // ["\u20B3"]: `${amount.toString()}`, // this unicode = ₳
      ada: `${amount.toString()}`,
    };

    var dt = new Date();
    var secs = dt.getSeconds() + 60 * dt.getMinutes() + 60 * 60 * dt.getHours();
    let word = words[Math.floor(Math.random() * words.length)];
    word = word!.charAt(0).toUpperCase() + word!.slice(1);

    const policyId = resolveScriptHash(forgingScript);
    const assetName = `Mesh${word}Token-${secs}`;
    const fullAssetMetadata = {
      [policyId]: {
        [assetName]: assetMetadata,
      },
    };

    const txBuilder = new MeshTxBuilder({ fetcher: provider });

    const donateAddress = process.env.DONATE_ADA_ADDRESS!;

    const txHex = await txBuilder
      .selectUtxosFrom(utxos)
      .mint("1", policyId, stringToHex(assetName))
      .mintingScript(forgingScript)
      .metadataValue(721, fullAssetMetadata)
      .txOut(donateAddress, [
        { unit: "lovelace", quantity: costLovelace.toString() },
      ])
      .changeAddress(recipientAddress)
      .complete();

    const unsignedTx = await wallet.signTx(txHex, true);

    res.status(200).json({ unsignedTx });
  } catch (error) {
    res.status(500).json({ error: error });
  }
}
