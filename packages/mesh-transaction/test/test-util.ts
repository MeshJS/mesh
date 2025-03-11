import { applyCborEncoding, resolveScriptHash } from "@meshsdk/core";
import { blake2b } from "@meshsdk/core-cst";

export const txHash = (tx: string) => {
  return blake2b(32).update(Buffer.from(tx, "utf-8")).digest("hex");
};

export const alwaysSucceedCbor = applyCborEncoding(
  "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01",
);

export const alwaysSucceedHash = resolveScriptHash(alwaysSucceedCbor, "V3");
