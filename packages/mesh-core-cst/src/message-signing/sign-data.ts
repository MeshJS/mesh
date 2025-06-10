import {
  CborBytes,
  CborMap,
  CborMapEntry,
  CborNegInt,
  CborText,
  CborUInt,
} from "@harmoniclabs/cbor";

import { DataSignature, stringToHex, isHexString} from "@meshsdk/common";

import { HexBlob, Signer } from "../types";
import { CoseSign1, getCoseKeyFromPublicKey } from "./cose-sign1";



/**
 * Sign the data string using the provided signer
 * @param data The data string to sign
 * @param signer The signer object containing the key and address
 * @returns DataSignature for verification
 */
export const signData = (data: string, signer: Signer): DataSignature => {
  const hexData = isHexString(data) ? data : stringToHex(data);
  const payload = Buffer.from(hexData, "hex");
  const publicKey = Buffer.from(signer.key.toPublic().bytes());

  const protectedMap: CborMapEntry[] = [];
  // Set protected headers as per CIP08
  // Set Algorthm used by Cardano keys
  protectedMap.push({ k: new CborUInt(1), v: new CborNegInt(-8) });
  // Set PublicKey
  protectedMap.push({ k: new CborUInt(4), v: new CborBytes(publicKey) });
  // Set Address
  protectedMap.push({
    k: new CborText("address"),
    v: new CborBytes(Buffer.from(signer.address.toBytes(), "hex")),
  });

  const coseSign1Builder = new CoseSign1({
    protectedMap: new CborMap(protectedMap),
    unProtectedMap: new CborMap([]),
    payload: new CborBytes(payload),
  });

  const signature = signer.key.sign(
    HexBlob(Buffer.from(coseSign1Builder.createSigStructure()).toString("hex")),
  );

  const coseSignature = coseSign1Builder
    .buildMessage(Buffer.from(signature.bytes()))
    .toString("hex");

  return {
    key: getCoseKeyFromPublicKey(publicKey.toString("hex")).toString("hex"),
    signature: coseSignature,
  };
};
