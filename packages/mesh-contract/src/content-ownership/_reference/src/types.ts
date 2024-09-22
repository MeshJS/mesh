import { UTxO } from "@meshsdk/core";

export type Post = {
  registryNumber: number;
  contentHashHex: string;
  ownerAssetHex: string;
  content: Content;
};

export type Content = {
  Description: string;
  Content: string | undefined;

  id: string;
  title: string;
  description: string;
  content?: string | undefined;
  image: File | null;
};

export type WalletData = {
  walletAddress: string;
  feeUtxo: UTxO;
  collateralUtxo: UTxO;
  ownerAssetHex: string;
};
