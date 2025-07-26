/* eslint-disable no-magic-numbers, sonarjs/no-element-overwrite */
import BN from 'bn.js';
import * as ecc from '@bitcoinerlab/secp256k1';
import { sha256 } from 'js-sha256';
import * as bitcoin from 'bitcoinjs-lib';

bitcoin.initEccLib(ecc);

/**
 * The secp256k1 order n:
 * FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
 */
const SECP256K1_ORDER = new BN('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141', 16);

/**
 * Computes a tagged hash as specified in BIP341.
 *
 * The tagged hash for a given tag and message is defined as:
 *   SHA256( SHA256(tag) || SHA256(tag) || msg )
 *
 * @param tag - The tag to use (e.g. "TapTweak").
 * @param msg - The message to hash.
 * @returns The resulting 32-byte hash.
 */
const taggedHash = (tag: string, msg: Buffer): Buffer => {
  const tagHash = new Uint8Array(sha256.arrayBuffer(tag));

  const combined = new Uint8Array(tagHash.length * 2 + msg.length);
  combined.set(tagHash, 0);
  combined.set(tagHash, tagHash.length);
  combined.set(msg, tagHash.length * 2);

  const resultBuffer = sha256.arrayBuffer(combined);
  return Buffer.from(resultBuffer);
};

/**
 * Tweaks an internal Taproot public key to produce the final output (tweaked) public key.
 *
 * According to BIP341/BIP86, given an internal x‑only public key P (32 bytes)
 * and an optional script tree merkle root, the tweak is computed as:
 *
 *    t = taggedHash("TapTweak", P || merkleRoot)
 *
 * Then the output public key Q is computed as:
 *
 *    Q = P + t*G
 *
 * This function uses the provided `xOnlyPointAddTweak` function to perform the EC point addition.
 *
 * @param internalPubKey - The 32-byte internal public key (x‑only) as a Buffer.
 * @param merkleRoot - An optional 32-byte merkle root (if a script tree is used).
 * @returns The tweaked output public key (x‑only) as a Buffer.
 * @throws {Error} If the internal public key is not 32 bytes or if the tweak addition fails.
 */
export const tweakTaprootPubKey = (internalPubKey: Buffer, merkleRoot?: Buffer): Buffer => {
  if (internalPubKey.length !== 32) {
    throw new Error('Internal public key must be 32 bytes (x-only format).');
  }

  // Use the merkleRoot if provided; otherwise, use only the internal public key.
  const tweakInput = merkleRoot ? Buffer.concat([internalPubKey, merkleRoot]) : internalPubKey;
  const tweak = taggedHash('TapTweak', tweakInput);

  // Use the provided function to add the tweak to the internal public key.
  // Convert Buffer to Uint8Array for compatibility.
  const result = ecc.xOnlyPointAddTweak(new Uint8Array(internalPubKey), new Uint8Array(tweak));
  if (result === null) {
    throw new Error('Failed to apply taproot tweak');
  }

  return Buffer.from(result.xOnlyPubkey);
};

/**
 * Tweaks a Taproot private key.
 *
 * Given a derived private key and its corresponding internal (x‑only) public key,
 * computes the tweak and returns the tweaked private key:
 *
 *   tweakedPrivate = derivedPrivate + H_TapTweak(internalPubKey) mod n
 *
 * @param derivedPrivateKey - The derived private key (Buffer, 32 bytes).
 * @param internalPubKey - The internal public key (x‑only, 32 bytes).
 * @returns The tweaked private key (Buffer, 32 bytes).
 */
export const tweakTaprootPrivateKey = (derivedPrivateKey: Buffer, internalPubKey: Buffer): Buffer => {
  const tweak = taggedHash('TapTweak', internalPubKey);
  const bnDerived = new BN(derivedPrivateKey);
  const bnTweak = new BN(tweak);

  // Compute tweaked key = derivedPrivateKey + tweak (mod n)
  const tweaked = bnDerived.add(bnTweak).umod(SECP256K1_ORDER);

  return Buffer.from(tweaked.toArrayLike(Buffer, 'be', 32));
};
