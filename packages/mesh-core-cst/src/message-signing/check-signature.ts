import { DataSignature } from "@meshsdk/common";

import { CoseSign1, getPublicKeyFromCoseKey } from "./cose-sign1";

export const checkSignature = (
  data: string,
  { key, signature }: DataSignature,
) => {
  const builder = CoseSign1.fromCbor(signature);

  if (builder.getPayload() === null) {
    return false;
  }

  if (Buffer.from(data, "hex").compare(builder.getPayload()!) !== 0) {
    return false;
  }

  return builder.verifySignature({
    publicKeyBuffer: getPublicKeyFromCoseKey(key),
  });
};
