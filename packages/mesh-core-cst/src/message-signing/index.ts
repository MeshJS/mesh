import { customAlphabet } from "nanoid";

import { DataSignature, stringToHex } from "@meshsdk/common";

import {
  getCoseKeyFromPublicKey,
  getPublicKeyFromCoseKey,
  Signer,
  StricaCoseSign1,
} from "../";

export const signData = (data: string, signer: Signer): DataSignature => {
  const payload = Buffer.from(data, "hex");
  const publicKey = signer.key.toPublicKey().toBytes();

  const protectedMap = new Map();
  // Set protected headers as per CIP08
  // Set Algorthm used by Cardano keys
  protectedMap.set(1, -8);
  // Set PublicKey
  protectedMap.set(4, publicKey);
  // Set Address
  protectedMap.set("address", Buffer.from(signer.address.toBytes(), "hex"));

  const coseSign1Builder = new StricaCoseSign1({
    protectedMap,
    unProtectedMap: new Map(),
    payload: payload,
  });

  const signature = signer.key.sign(coseSign1Builder.createSigStructure());

  const coseSignature = coseSign1Builder
    .buildMessage(signature)
    .toString("hex");

  return {
    key: getCoseKeyFromPublicKey(publicKey.toString("hex")).toString("hex"),
    signature: coseSignature,
  };
};

export const checkSignature = (
  data: string,
  { key, signature }: DataSignature,
) => {
  const builder = StricaCoseSign1.fromCbor(signature);

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

export const generateNonce = (label = "", length = 32) => {
  if (length <= 0 || length > 2048) {
    throw new Error("Length must be bewteen 1 and 2048");
  }
  const randomString = customAlphabet(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  );
  const payload = randomString(length);
  return stringToHex(`${label}${payload}`);
};
