import { randomBytes } from "node:crypto";

import { pubKeyAddress, serializeAddressObj } from "@meshsdk/core";
import { Crypto, HexBlob } from "@meshsdk/core-cst";

import {
  Signer,
  SignTxHash,
  TxHashRequest,
  TxHashSignature,
} from "../../src/tx-builder";

/*
 * Signers of transaction hashes over keys made for the test only. A test compares their hashes
 * and public keys, never the key itself, which stays inside `testKey`.
 */

/**
 * A key made for the test, and what a signer of hashes answers for it. Call `Crypto.ready()`
 * first
 */
export const testKey = () => {
  const key = Crypto.Ed25519PrivateKey.fromNormalBytes(randomBytes(32));
  const vkey = key.toPublic().hex() as string;
  const keyHash = key.toPublic().hash().hex() as string;
  /** The signature of a transaction hash: of the 32 bytes its hex stands for */
  const sign = (txHash: string) => key.sign(HexBlob(txHash)).hex() as string;
  return {
    vkey,
    keyHash,
    /** A preprod address whose payment key this is */
    address: serializeAddressObj(pubKeyAddress(keyHash), 0),
    sign,
    answer: (txHash: string): TxHashSignature => ({
      vkey,
      signature: sign(txHash),
    }),
  };
};

export type TestKey = ReturnType<typeof testKey>;

/** A signer of hashes in either form, recording each request and the `this` it was called with */
export const hashSigner = (
  form: "object" | "callback",
  answer: (request: TxHashRequest) => unknown,
) => {
  const requests: TxHashRequest[] = [];
  const self: unknown[] = [];
  function signTxHash(this: unknown, request: TxHashRequest) {
    requests.push(request);
    self.push(this);
    return Promise.resolve().then(() => answer(request)) as Promise<
      readonly TxHashSignature[]
    >;
  }
  const signer: Signer =
    form === "object" ? { signTxHash } : (signTxHash as SignTxHash);
  return { signer, requests, self };
};

/** A signer of hashes that signs with each of these keys that it is asked for */
export const keysSigner = (form: "object" | "callback", ...keys: TestKey[]) =>
  hashSigner(form, ({ txHash, keyHashes }) =>
    keys
      .filter(
        (key) => keyHashes === undefined || keyHashes.includes(key.keyHash),
      )
      .map((key) => key.answer(txHash)),
  );
