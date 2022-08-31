export type AssetMetadata =
  | FungibleAssetMetadata
  | NonFungibleAssetMetadata;

export type FungibleAssetMetadata = CIP25 & {
  ticker: string;
  decimals: number;
  version: `${number}.${number}`;
};

export type NonFungibleAssetMetadata =
  | AudioAssetMetadata
  | ImageAssetMetadata
  | SmartAssetMetadata
  | VideoAssetMetadata;

type AudioAssetMetadata = CIP25 & Files;

export type ImageAssetMetadata = CIP25 & Files & {
  artists?: [{
    name: string;
    twitter?: `https://twitter.com/${string}`;
  }];
  attributes?: {
    [key: string]: string;
  };
  traits?: string[];
};

type SmartAssetMetadata = CIP25 & Files;

type VideoAssetMetadata = CIP25 & Files;

type CIP25 = {
  name: string;
  image: `${string}://${string}`;
  mediaType?: `image/${string}`;
  description?: string | string[];
  instagram?: `https://instagram.com/${string}`;
  twitter?: `https://twitter.com/${string}`;
  discord?: `https://discord.gg/${string}`;
  website?: `https://${string}`;
};

type Files = {
  files?: [{
    name: string;
    src: `${string}://${string}`;
    mediaType: `${string}/${string}`;
  }];
};
