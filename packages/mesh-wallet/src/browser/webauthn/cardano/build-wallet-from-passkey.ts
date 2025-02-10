import base32 from "base32-encoding";
import { bech32 } from "bech32";

import { Crypto } from "@meshsdk/core-cst";

export async function buildWalletFromPasskey(
  rawId: string,
  password: string,
  appSalt = "appSalt",
) {
  const entropy = await createEntropy(rawId, appSalt);
  return buildKey(Buffer.from(entropy), password);
}

function buildKey(entropy: Buffer, password: string) {
  const bip32Key = Crypto.Bip32PrivateKey.fromBip39Entropy(entropy, password);

  const bytes = base32.encode(bip32Key.bytes());
  const bech32PrivateKey = bech32.encode("xprv", bytes, 1023);

  return {
    bech32PrivateKey: bech32PrivateKey,
  };
}

async function createEntropy(rawId: string, appSalt: string) {
  // The rawId is inherently unique for each Passkey, ensuring no two users have the same derived entropy.
  const rawIdBytes = new Uint8Array(new TextEncoder().encode(rawId));

  // Combine with app-specific salt, using an app-specific salt ensures that the same rawId cannot be reused across different applications.
  const saltBytes = new TextEncoder().encode(appSalt);

  const entropyBuffer = new Uint8Array([...rawIdBytes, ...saltBytes]);

  // Hash the combined data to produce 256-bit entropy
  const entropy = await crypto.subtle.digest("SHA-256", entropyBuffer);

  return entropy;
}
