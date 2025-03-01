import { blake2b } from "blakejs";

export const hashDrepAnchor = (jsonLD: object): string => {
  const jsonHash = blake2b(JSON.stringify(jsonLD, null, 2), undefined, 32);
  return Buffer.from(jsonHash).toString("hex");
};
