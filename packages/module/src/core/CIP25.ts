export type MetadataStandard = {
  name: string;
  image: `${string}://${string}`;
  mediaType?: `image/${string}`;
  description?: string | string[];
  instagram?: `https://instagram.com/${string}`;
  twitter?: `https://twitter.com/${string}`;
  discord?: `https://discord.gg/${string}`;
  website?: `https://${string}`;
};

export type Files = {
  files?: [{
    name: string;
    src: `${string}://${string}`;
    mediaType: `${string}/${string}`;
  }];
};
