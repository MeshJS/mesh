import * as BaseEncoding from "@scure/base";

import {
  bytesToHex,
  DataSignature,
  generateMnemonic,
  mnemonicToEntropy,
} from "@meshsdk/common";
import {
  Address,
  Bip32PrivateKey,
  buildBaseAddress,
  buildBip32PrivateKey,
  buildEnterpriseAddress,
  buildKeys,
  buildRewardAddress,
  deserializeTx,
  deserializeTxHash,
  Ed25519KeyHashHex,
  Ed25519PublicKeyHex,
  Ed25519SignatureHex,
  Hash28ByteBase16,
  resolveTxHash,
  Serialization,
  signData,
  StricaPrivateKey,
  Transaction,
  VkeyWitness,
} from "@meshsdk/core-cst";

export type Account = {
  baseAddress: Address;
  enterpriseAddress: Address;
  rewardAddress: Address;
  baseAddressBech32: string;
  enterpriseAddressBech32: string;
  rewardAddressBech32: string;
  paymentKey: StricaPrivateKey;
  stakeKey: StricaPrivateKey;
  paymentKeyHex: string;
  stakeKeyHex: string;
};

export type EmbeddedWalletKeyType =
  | {
      type: "root";
      bech32: string;
    }
  | {
      type: "cli";
      payment: string;
      stake?: string;
    }
  | {
      type: "mnemonic";
      words: string[];
    };

export type CreateEmbeddedWalletOptions = {
  networkId: number;
  key: EmbeddedWalletKeyType;
};

export class WalletStaticMethods {
  static privateKeyToEntropy(bech32: string): string {
    const bech32DecodedBytes = BaseEncoding.bech32.decodeToBytes(bech32).bytes;
    const bip32PrivateKey = Bip32PrivateKey.fromBytes(bech32DecodedBytes);
    return bytesToHex(bip32PrivateKey.bytes());
  }

  static mnemonicToEntropy(words: string[]): string {
    const entropy = mnemonicToEntropy(words.join(" "));
    const bip32PrivateKey = buildBip32PrivateKey(entropy);
    return bytesToHex(bip32PrivateKey.bytes());
  }

  static signingKeyToEntropy(
    paymentKey: string,
    stakeKey: string,
  ): [string, string] {
    return [
      paymentKey.startsWith("5820") ? paymentKey.slice(4) : paymentKey,
      stakeKey.startsWith("5820") ? stakeKey.slice(4) : stakeKey,
    ];
  }

  static getAddresses(
    paymentKey: StricaPrivateKey,
    stakingKey: StricaPrivateKey,
    networkId = 0,
  ): {
    baseAddress: Address;
    enterpriseAddress: Address;
    rewardAddress: Address;
  } {
    const baseAddress = buildBaseAddress(
      networkId,
      Hash28ByteBase16.fromEd25519KeyHashHex(
        Ed25519KeyHashHex(paymentKey.toPublicKey().hash().toString("hex")),
      ),
      Hash28ByteBase16.fromEd25519KeyHashHex(
        Ed25519KeyHashHex(stakingKey.toPublicKey().hash().toString("hex")),
      ),
    );

    const enterpriseAddress = buildEnterpriseAddress(
      networkId,
      Hash28ByteBase16.fromEd25519KeyHashHex(
        Ed25519KeyHashHex(paymentKey.toPublicKey().hash().toString("hex")),
      ),
    );

    const rewardAddress = buildRewardAddress(
      networkId,
      Hash28ByteBase16.fromEd25519KeyHashHex(
        Ed25519KeyHashHex(stakingKey.toPublicKey().hash().toString("hex")),
      ),
    );

    return {
      baseAddress: baseAddress.toAddress(),
      enterpriseAddress: enterpriseAddress.toAddress(),
      rewardAddress: rewardAddress.toAddress(),
    };
  }

  static generateMnemonic(strength = 256): string[] {
    const mnemonic = generateMnemonic(strength);
    return mnemonic.split(" ");
  }

  static addWitnessSets(txHex: string, witnesses: VkeyWitness[]): string {
    let tx = deserializeTx(txHex);
    let witnessSet = tx.witnessSet();
    let witnessSetVkeys = witnessSet.vkeys();
    let witnessSetVkeysValues: Serialization.VkeyWitness[] = witnessSetVkeys
      ? [...witnessSetVkeys.values(), ...witnesses]
      : witnesses;
    witnessSet.setVkeys(
      Serialization.CborSet.fromCore(
        witnessSetVkeysValues.map((vkw) => vkw.toCore()),
        VkeyWitness.fromCore,
      ),
    );
    return new Transaction(tx.body(), witnessSet, tx.auxiliaryData()).toCbor();
  }
}

export class EmbeddedWallet extends WalletStaticMethods {
  private readonly _entropy?: string | [string, string];
  private readonly _networkId: number;

  constructor(options: CreateEmbeddedWalletOptions) {
    super();
    this._networkId = options.networkId;

    switch (options.key.type) {
      case "mnemonic":
        this._entropy = WalletStaticMethods.mnemonicToEntropy(
          options.key.words,
        );
        break;
      case "root":
        this._entropy = WalletStaticMethods.privateKeyToEntropy(
          options.key.bech32,
        );
        break;
      case "cli":
        this._entropy = WalletStaticMethods.signingKeyToEntropy(
          options.key.payment,
          options.key.stake ?? "f0".repeat(32),
        );
        break;
    }
  }

  getAccount(accountIndex = 0, keyIndex = 0): Account {
    if (this._entropy == undefined)
      throw new Error("[EmbeddedWallet] No keys initialized");

    const { paymentKey, stakeKey } = buildKeys(
      this._entropy,
      accountIndex,
      keyIndex,
    );

    const { baseAddress, enterpriseAddress, rewardAddress } =
      WalletStaticMethods.getAddresses(paymentKey, stakeKey, this._networkId);

    return {
      baseAddress: baseAddress,
      enterpriseAddress: enterpriseAddress,
      rewardAddress: rewardAddress,
      baseAddressBech32: baseAddress.toBech32(),
      enterpriseAddressBech32: enterpriseAddress.toBech32(),
      rewardAddressBech32: rewardAddress.toBech32(),
      paymentKey: paymentKey,
      stakeKey: stakeKey,
      paymentKeyHex: paymentKey.toBytes().toString("hex"),
      stakeKeyHex: stakeKey.toBytes().toString("hex"),
    };
  }

  getNetworkId(): number {
    return this._networkId;
  }

  signData(
    address: string,
    payload: string,
    accountIndex = 0,
    keyIndex = 0,
  ): DataSignature {
    try {
      const account = this.getAccount(accountIndex, keyIndex);

      const foundAddress = [
        account.baseAddress,
        account.enterpriseAddress,
        account.rewardAddress,
      ].find((a) => a.toBech32() === address);

      if (foundAddress === undefined)
        throw new Error(
          `[EmbeddedWallet] Address: ${address} doesn't belong to this account.`,
        );

      return signData(payload, {
        address: Address.fromBech32(address),
        key: account.paymentKey,
      });
    } catch (error) {
      throw new Error(
        `[EmbeddedWallet] An error occurred during signData: ${error}.`,
      );
    }
  }

  signTx(unsignedTx: string, accountIndex = 0, keyIndex = 0): VkeyWitness {
    try {
      const txHash = deserializeTxHash(resolveTxHash(unsignedTx));

      const account = this.getAccount(accountIndex, keyIndex);

      const vKeyWitness = new VkeyWitness(
        Ed25519PublicKeyHex(
          account.paymentKey.toPublicKey().toBytes().toString("hex"),
        ),
        Ed25519SignatureHex(
          account.paymentKey.sign(Buffer.from(txHash, "hex")).toString("hex"),
        ),
      );

      return vKeyWitness;
    } catch (error) {
      throw new Error(
        `[EmbeddedWallet] An error occurred during signTx: ${error}.`,
      );
    }
  }
}
