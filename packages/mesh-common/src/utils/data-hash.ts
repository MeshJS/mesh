import { blake2bHex } from "blakejs";

export const hashDrepAnchor = (jsonLD: object): string => {
  const jsonHash = blake2bHex(JSON.stringify(jsonLD, null, 2), undefined, 32);
  return jsonHash;
};
