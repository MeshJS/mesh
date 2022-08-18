export type Recipient = {
  address: string;
  assets: { [assetId: string]: number };
};

// export type Asset = {
//   unit: string;
//   quantity: number;
//   policy: string;
//   name: string;
//   onchain?: { onchain_metadata: { image: string } };
//   image?: string;
// };
