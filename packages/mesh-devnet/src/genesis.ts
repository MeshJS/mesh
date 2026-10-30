/**
 * Genesis state for the devnet.
 *
 * Builds 5 pre-funded enterprise testnet wallets from deterministic
 * private key seeds.  At startup the CLI prints each wallet so users
 * can immediately build, sign and submit transactions.
 *
 * Uses @harmoniclabs/cardano-ledger-ts for address construction so the
 * bech32 output is byte-for-byte compatible with cardano-node and testnets.
 *
 * THESE ARE TEST KEYS — do not use on mainnet.
 */

import {
  PrivateKey as CLPrivKey,
  Address,
  Credential,
} from '@harmoniclabs/cardano-ledger-ts';

import { derivePublicKey, paymentKeyHash, toHex, fromHex } from './crypto.js';
import type { GenesisWallet, UTxO } from './types.js';
import { valueToMeshAssets } from './types.js';
import type { LedgerState } from './ledger/state.js';
import { NETWORK_ID } from './config.js';

// 5 well-known 32-byte test seeds (hex).  Not cryptographically secure.
const SEEDS: string[] = [
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
];

const GENESIS_LOVELACE = 10_000_000_000n; // 10 000 ADA per wallet

/** Build the genesis wallet descriptors from the fixed seeds. */
export function buildGenesisWallets(): GenesisWallet[] {
  return SEEDS.map((seedHex, index) => {
    // Derive public key using standard RFC 8032 Ed25519
    const seedBytes = fromHex(seedHex);
    const vkeyBytes = derivePublicKey(seedBytes);
    const khBytes   = paymentKeyHash(vkeyBytes); // blake2b-224

    // Build enterprise address via cardano-ledger-ts.
    // This guarantees byte-perfect compatibility with cardano-node.
    const clPriv   = new CLPrivKey(seedHex);
    const clPub    = clPriv.derivePublicKey();
    const clKHash  = clPub.hash; // PubKeyHash (blake2b-224 internally)

    const addr = NETWORK_ID === 0
      ? Address.testnet(Credential.keyHash(clKHash))
      : Address.mainnet(Credential.keyHash(clKHash));

    const addressHex   = toHex(Uint8Array.from(addr.toBytes()));
    const addressBech32 = addr.toString();

    // Sanity: noble blake2b-224 must equal cardano-ledger-ts hash
    const kh = toHex(khBytes);
    if (kh !== clKHash.toString()) {
      throw new Error(`Key hash mismatch for wallet ${index}: noble=${kh} cls=${clKHash.toString()}`);
    }

    return {
      index,
      privateKeyHex:   seedHex,
      // CIP-5 / cardano-cli payment.skey envelope: the wrapped CBOR bytes
      // of an ed25519 signing key. Mesh's `key: { type: 'cli', payment }`
      // accepts exactly this format and strips the leading 5820 itself.
      privateKeyCliHex: '5820' + seedHex,
      publicKeyHex:    toHex(vkeyBytes),
      paymentKeyHash:  kh,
      addressBech32,
      addressHex,
      initialLovelace: GENESIS_LOVELACE,
    };
  });
}

/**
 * Inject genesis UTxOs directly into the ledger state, bypassing
 * transaction validation (the genesis has no inputs to consume).
 */
export function applyGenesis(state: LedgerState, wallets: GenesisWallet[]): void {
  wallets.forEach((w, i) => {
    // 32 bytes filled with wallet index = deterministic valid 64-char hex tx hash
    const txHash = Buffer.alloc(32, i).toString('hex');
    const utxo: UTxO = {
      input:  { txHash, outputIndex: 0 },
      output: {
        address:    w.addressBech32,
        amount:     valueToMeshAssets({ lovelace: w.initialLovelace }),
        addressHex: w.addressHex,
        value:      { lovelace: w.initialLovelace },
      },
    };
    state.addUTxO(utxo);
  });
}

/** Return the genesis UTxO reference for wallet i — useful in tests/scripts. */
export function genesisUTxORef(i: number): { txHash: string; outputIndex: number } {
  return { txHash: Buffer.alloc(32, i).toString('hex'), outputIndex: 0 };
}
