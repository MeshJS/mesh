import { Data } from "./data";

export type RoyaltiesStandard = {
  rate: string;
  address: string;
};

export const royaltiesStandardKeys = ["rate", "address"];

type MetadataStandard = any;

export const metadataStandardKeys = [
  "name",
  "image",
  "mediaType",
  "description",
  "instagram",
  "twitter",
  "discord",
  "website",
];

export type Files = {
  files?: [
    {
      name: string;
      src: `${string}://${string}`;
      mediaType: `${string}/${string}`;
    },
  ];
};

export type AssetMetadata =
  | FungibleAssetMetadata
  | NonFungibleAssetMetadata
  | RoyaltiesStandard;

export type FungibleAssetMetadata = MetadataStandard & {
  ticker: string;
  decimals: number;
  version: `${number}.${number}`;
};

export const fungibleAssetKeys = ["ticker", "decimals"];

export type NonFungibleAssetMetadata =
  | AudioAssetMetadata
  | ImageAssetMetadata
  | SmartAssetMetadata
  | VideoAssetMetadata;

type AudioAssetMetadata = MetadataStandard & Files;

export type ImageAssetMetadata = MetadataStandard &
  Files & {
    artists?: [
      {
        name: string;
        twitter?: `https://twitter.com/${string}`;
      },
    ];
    attributes?: {
      [key: string]: string;
    };
    traits?: string[];
  };

type SmartAssetMetadata = MetadataStandard & Files;

type VideoAssetMetadata = MetadataStandard & Files;

/**
 * Transform the metadata into the format needed in CIP68 inline datum (in Mesh Data type)
 * @param metadata The metadata body without outer wrapper of policy id & token name
 * @returns The metadata in Mesh Data type, ready to be attached as inline datum
 */
export const metadataToCip68 = (metadata: any): Data => {
  switch (typeof metadata) {
    case "object":
      if (metadata instanceof Array) {
        return metadata.map((item) => metadataToCip68(item));
      }
      const metadataMap = new Map();
      const keys = Object.keys(metadata);
      keys.forEach((key) => {
        metadataMap.set(key, metadataToCip68(metadata[key]));
      });
      return {
        alternative: 0,
        fields: [metadataMap, 1],
      };

    default:
      return metadata;
  }
};
