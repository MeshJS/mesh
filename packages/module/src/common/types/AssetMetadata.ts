export type AssetMetadata =
  | FungibleAssetMetadata
  | NonFungibleAssetMetadata;

export type FungibleAssetMetadata = CIP25 & {
  ticker: string;
  decimals: number;
  version: string; // `${number}.${number}`;
};

export type NonFungibleAssetMetadata =
  | AudioAssetMetadata
  | ImageAssetMetadata
  | SmartAssetMetadata
  | VideoAssetMetadata;

type AudioAssetMetadata = CIP25 & Files & {};

export type ImageAssetMetadata = CIP25 & Files & {
  collection: string;
  project: string;
  artists?: [{
    name: string;
    twitter?: string; // `https://twitter.com/${string}`;
  }];
  attributes?: {
    [key: string]: string;
  };
  traits?: string[];
};

type SmartAssetMetadata = CIP25 & Files & {};

type VideoAssetMetadata = CIP25 & Files & {};

type CIP25 = {
  name: string;
  image: string; // `${string}://${string}`;
  mediaType?: string; // `image/${string}`;
  description?: string | string[];
  instagram?: string; // `https://instagram.com/${string}`;
  twitter?: string; // `https://twitter.com/${string}`;
  discord?: string; // `https://discord.gg/${string}`;
  website?: string; // `https://${string}`;
};

type Files = {
  files?: [{
    name: string;
    src: string; // `${string}://${string}`;
    mediaType: string; // `${string}/${string}`;
  }];
};
