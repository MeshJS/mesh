import { blake2b } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";
import { pbkdf2Sync } from "pbkdf2";

import { HARDENED_KEY_START } from "@meshsdk/common";

import { StricaBip32PrivateKey, StricaPrivateKey } from "../";
import {
  AddressType,
  BaseAddress,
  Bip32PrivateKey,
  CredentialType,
  DRepID,
  Ed25519KeyHash,
  Ed25519KeyHashHex,
  Ed25519PublicKeyHex,
  EnterpriseAddress,
  Hash28ByteBase16,
  NativeScript,
  NetworkId,
  RewardAddress,
  ScriptPubkey,
} from "../types";

export const buildBaseAddress = (
  networkId: number,
  paymentKeyHash: Hash28ByteBase16,
  stakeKeyHash: Hash28ByteBase16,
): BaseAddress => {
  return BaseAddress.fromCredentials(
    networkId,
    {
      hash: paymentKeyHash,
      type: CredentialType.KeyHash,
    },
    {
      hash: stakeKeyHash,
      type: CredentialType.KeyHash,
    },
  );
};

export const buildEnterpriseAddress = (
  networkId: number,
  paymentKeyHash: Hash28ByteBase16,
): EnterpriseAddress => {
  return EnterpriseAddress.fromCredentials(networkId, {
    hash: paymentKeyHash,
    type: CredentialType.KeyHash,
  });
};

export const buildBip32PrivateKey = (
  entropy: string,
  password = "",
): Bip32PrivateKey => {
  const PBKDF2_ITERATIONS = 4096;
  const PBKDF2_KEY_SIZE = 96;
  const PBKDF2_DIGEST_ALGORITHM = "sha512";

  const clampScalar = (scalar: Buffer): Buffer => {
    if (scalar[0] !== undefined) {
      scalar[0] &= 0b1111_1000;
    }
    if (scalar[31] !== undefined) {
      scalar[31] &= 0b0001_1111;
      scalar[31] |= 0b0100_0000;
    }
    return scalar;
  };

  const _entropy = Buffer.from(entropy, "hex");

  const xprv = pbkdf2Sync(
    password,
    _entropy,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_SIZE,
    PBKDF2_DIGEST_ALGORITHM,
  );
  return Bip32PrivateKey.fromBytes(clampScalar(xprv));
};

export const buildRewardAddress = (
  networkId: number,
  stakeKeyHash: Hash28ByteBase16,
): RewardAddress => {
  const cred = {
    type: CredentialType.KeyHash,
    hash: stakeKeyHash,
  };
  return RewardAddress.fromCredentials(networkId, cred);
};

export const buildKeys = (
  entropy: string | [string, string],
  accountIndex: number,
  keyIndex = 0,
): {
  paymentKey: StricaPrivateKey;
  stakeKey: StricaPrivateKey;
  dRepKey?: StricaPrivateKey;
} => {
  if (typeof entropy === "string") {
    const rootKey = new StricaBip32PrivateKey(Buffer.from(entropy, "hex"));

    // hardened derivation
    const accountKey = rootKey
      .derive(HARDENED_KEY_START + 1852) // purpose
      .derive(HARDENED_KEY_START + 1815) // coin type
      .derive(HARDENED_KEY_START + accountIndex); // account index

    const paymentKey = accountKey
      .derive(0) // external chain
      .derive(keyIndex) // payment key index
      .toPrivateKey();
    const stakeKey = accountKey
      .derive(2) // staking key
      .derive(0)
      .toPrivateKey();
    const dRepKey = accountKey
      .derive(3) // dRep Keys
      .derive(keyIndex)
      .toPrivateKey();

    return { paymentKey, stakeKey, dRepKey };
  } else {
    const paymentKey = StricaPrivateKey.fromSecretKey(
      Buffer.from(entropy[0], "hex"),
    );
    const stakeKey = StricaPrivateKey.fromSecretKey(
      Buffer.from(entropy[1], "hex"),
    );

    return { paymentKey, stakeKey };
  }
};

export const buildScriptPubkey = (keyHash: Ed25519KeyHash): NativeScript => {
  const scriptPubkey = new ScriptPubkey(Ed25519KeyHashHex(keyHash.hex()));
  return NativeScript.newScriptPubkey(scriptPubkey);
};

export const buildDRepID = (
  dRepKey: Ed25519PublicKeyHex,
  networkId: NetworkId = NetworkId.Testnet,
  addressType: AddressType = AddressType.EnterpriseKey,
): DRepID => {
  const dRepKeyBytes = Buffer.from(dRepKey, "hex");
  const dRepIdHex = blake2b(28).update(dRepKeyBytes).digest("hex");
  const paymentAddress = EnterpriseAddress.packParts({
    networkId,
    paymentPart: {
      hash: Hash28ByteBase16(dRepIdHex),
      type: CredentialType.KeyHash,
    },
    type: addressType,
  });
  return HexBlob.toTypedBech32<DRepID>(
    "drep",
    HexBlob.fromBytes(paymentAddress),
  );
};
