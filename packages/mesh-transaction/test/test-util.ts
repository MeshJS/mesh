import { applyCborEncoding, resolveScriptHash } from "@meshsdk/core";
import { blake2b } from "@meshsdk/core-cst";

export const txHash = (tx: string) => {
  return blake2b(32).update(Buffer.from(tx, "utf-8")).digest("hex");
};

export const alwaysSucceedCbor = applyCborEncoding(
  "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01",
);

export const alwaysSucceedHash = resolveScriptHash(alwaysSucceedCbor, "V3");

export const alwaysFailCbor = applyCborEncoding(
  "5001010023259800b452689b2b20025735",
);

export const alwaysFailHash = resolveScriptHash(alwaysFailCbor, "V3");

export const spend42Cbor = applyCborEncoding(
  "587901010029800aba2aba1aab9eaab9dab9a4888896600264653001300600198031803800cc0180092225980099b8748008c01cdd500144c8cc896600266e1d2000300a375400313370e6eb4c030c02cdd5000a40a916402460140026014601600260106ea800a29450060c018004c00cdd5003452689b2b20021",
);

export const spend42Hash = resolveScriptHash(spend42Cbor, "V3");
