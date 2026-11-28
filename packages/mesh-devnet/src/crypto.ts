/**
 * Cryptographic primitives.
 *
 * All on-chain Cardano crypto uses:
 *   • blake2b-256  →  transaction / block hashes
 *   • blake2b-224  →  payment / stake key hashes (28 bytes)
 *   • Ed25519      →  signatures (RFC 8032 standard, NOT BIP-32 extended)
 *
 * @noble/ed25519 v3 requires sha512 to be injected for sync operations.
 * @noble/hashes v2 changed its export paths; we use the .js suffixed paths.
 */

import * as ed           from '@noble/ed25519';
import { blake2b }       from '@noble/hashes/blake2.js';
import { sha512 }        from '@noble/hashes/sha2.js';

// Enable synchronous Ed25519 operations (required by @noble/ed25519 v3)
ed.hashes.sha512 = sha512;

// ── Hashing ───────────────────────────────────────────────────────────────────

export function blake2b256(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32 });
}

export function blake2b224(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 28 });
}

// ── Hex helpers ───────────────────────────────────────────────────────────────

export function toHex(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString('hex');
}

export function fromHex(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

// ── Ed25519 ───────────────────────────────────────────────────────────────────

/**
 * Derive a 32-byte Ed25519 public key from a 32-byte private seed.
 * Uses RFC 8032 standard derivation (not BIP-32).
 */
export function derivePublicKey(privateKeySeed: Uint8Array): Uint8Array {
  return ed.getPublicKey(privateKeySeed);
}

/**
 * Compute the Cardano payment key hash:
 *   paymentKeyHash = blake2b-224( ed25519_public_key )
 *
 * This matches what `PublicKey.hash` returns in @harmoniclabs/cardano-ledger-ts.
 */
export function paymentKeyHash(vkey32: Uint8Array): Uint8Array {
  return blake2b224(vkey32);
}

/**
 * Verify an Ed25519 signature.
 *
 * In Cardano:  message = blake2b-256( CBOR(tx_body) )  = tx.body.hash
 * The witness: [vkey(32 bytes), signature(64 bytes)]
 *
 * @throws never — returns false on any error
 */
export function verifyEd25519(
  vkey32:    Uint8Array,
  message:   Uint8Array,
  sig64:     Uint8Array,
): boolean {
  try {
    return ed.verify(sig64, message, vkey32);
  } catch {
    return false;
  }
}

/**
 * Sign a message with a 32-byte private seed.
 * Used by genesis wallet helpers and test utilities.
 */
export function signEd25519(privateKeySeed: Uint8Array, message: Uint8Array): Uint8Array {
  return ed.sign(message, privateKeySeed);
}
