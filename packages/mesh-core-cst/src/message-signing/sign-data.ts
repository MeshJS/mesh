import { DataSignature } from "@meshsdk/common";

import { Signer } from "../types";
import { CoseSign1, getCoseKeyFromPublicKey } from "./cose-sign1";

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

  const coseSign1Builder = new CoseSign1({
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
