import { DataSignature } from "@meshsdk/common";

import { PrivateKey, PublicKey } from "../stricahq";

export const signData = (
  data: string,
  privateKey: PrivateKey,
): DataSignature => {
  const payload = Buffer.from(data);
  const signature = privateKey.sign(payload);

  return {
    key: privateKey.toPublicKey().toBytes().toString("hex"),
    signature: signature.toString("hex"),
  };
};

export const checkSignature = (
  data: string,
  { key, signature }: DataSignature,
) => {
  const publicKey = new PublicKey(Buffer.from(key, "hex"));
  return publicKey.verify(Buffer.from(signature, "hex"), Buffer.from(data));
};
