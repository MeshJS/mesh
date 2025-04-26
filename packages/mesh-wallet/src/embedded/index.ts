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
  buildDRepID,
  buildEnterpriseAddress,
  buildKeys,
  buildRewardAddress,
  Crypto,
  deserializeTx,
  deserializeTxHash,
  DRep,
  DRepID,
  Ed25519KeyHashHex,
  Ed25519PrivateKey,
  Ed25519PublicKeyHex,
  Hash28ByteBase16,
  HexBlob,
  hexToBech32,
  resolveTxHash,
  Serialization,
  signData,
  Transaction,
  VkeyWitness,
} from "@meshsdk/core-cst";

export type AccountType = "payment" | "stake" | "drep";

export type Account = {
  baseAddress: Address;
  enterpriseAddress: Address;
  rewardAddress: Address;
  baseAddressBech32: string;
  enterpriseAddressBech32: string;
  rewardAddressBech32: string;
  paymentKey: Ed25519PrivateKey;
  stakeKey: Ed25519PrivateKey;
  paymentKeyHex: string;
  stakeKeyHex: string;

  drepKey?: Ed25519PrivateKey;
  pubDRepKey?: string;
  dRepIDBech32?: DRepID;
  dRepIDHash?: Ed25519KeyHashHex;
  dRepIDCip105?: string;
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
    }
  | {
      type: "bip32Bytes";
      bip32Bytes: Uint8Array;
    };

export type CreateEmbeddedWalletOptions = {
  networkId: number;
  key: EmbeddedWalletKeyType;
};

export class WalletStaticMethods {
  static privateKeyBech32ToPrivateKeyHex(_bech32: string): string {
    const bech32DecodedBytes = BaseEncoding.bech32.decodeToBytes(_bech32).bytes;
    const bip32PrivateKey = Bip32PrivateKey.fromBytes(bech32DecodedBytes);
    return bytesToHex(bip32PrivateKey.bytes());
  }

  static mnemonicToPrivateKeyHex(words: string[]): string {
    const entropy = mnemonicToEntropy(words.join(" "));
    const bip32PrivateKey = buildBip32PrivateKey(entropy);
    return bytesToHex(bip32PrivateKey.bytes());
  }

  static signingKeyToHexes(
    paymentKey: string,
    stakeKey: string,
  ): [string, string] {
    return [
      paymentKey.startsWith("5820") ? paymentKey.slice(4) : paymentKey,
      stakeKey.startsWith("5820") ? stakeKey.slice(4) : stakeKey,
    ];
  }

  static bip32BytesToPrivateKeyHex(bip32Bytes: Uint8Array): string {
    const bip32PrivateKey = Bip32PrivateKey.fromBytes(bip32Bytes);
    return bytesToHex(bip32PrivateKey.bytes());
  }

  static getAddresses(
    paymentKey: Ed25519PrivateKey,
    stakingKey: Ed25519PrivateKey,
    networkId = 0,
  ): {
    baseAddress: Address;
    enterpriseAddress: Address;
    rewardAddress: Address;
  } {
    const baseAddress = buildBaseAddress(
      networkId,
      Hash28ByteBase16.fromEd25519KeyHashHex(
        paymentKey.toPublic().hash().hex(),
      ),
      Hash28ByteBase16.fromEd25519KeyHashHex(
        stakingKey.toPublic().hash().hex(),
      ),
    ).toAddress();

    const enterpriseAddress = buildEnterpriseAddress(
      networkId,
      Hash28ByteBase16.fromEd25519KeyHashHex(
        paymentKey.toPublic().hash().hex(),
      ),
    ).toAddress();

    const rewardAddress = buildRewardAddress(
      networkId,
      Hash28ByteBase16.fromEd25519KeyHashHex(
        stakingKey.toPublic().hash().hex(),
      ),
    ).toAddress();

    return {
      baseAddress: baseAddress,
      enterpriseAddress: enterpriseAddress,
      rewardAddress: rewardAddress,
    };
  }

  static getDRepKey(
    dRepKey: Ed25519PrivateKey,
    networkId = 0,
  ): {
    pubDRepKey: string;
    dRepIDBech32: DRepID;
    dRepIDHash: Ed25519KeyHashHex;
    dRepIDCip105: string;
  } {
    const pubDRepKey = dRepKey.toPublic().hex().toString();

    const dRepIDBech32 = buildDRepID(
      Ed25519PublicKeyHex(pubDRepKey),
      networkId,
    );
    const dRep = DRep.newKeyHash(dRepKey.toPublic().hash().hex());
    const dRepIDHash = dRep.toKeyHash()!;

    const dRepIDCip105 = hexToBech32("drep", dRepIDHash);

    return {
      pubDRepKey,
      dRepIDBech32,
      dRepIDHash,
      dRepIDCip105,
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
  private readonly _walletSecret?: string | [string, string];
  private readonly _networkId: number;
  cryptoIsReady: boolean = false;

  constructor(options: CreateEmbeddedWalletOptions) {
    super();
    this._networkId = options.networkId;

    switch (options.key.type) {
      case "mnemonic":
        this._walletSecret = WalletStaticMethods.mnemonicToPrivateKeyHex(
          options.key.words,
        );
        break;
      case "root":
        this._walletSecret =
          WalletStaticMethods.privateKeyBech32ToPrivateKeyHex(
            options.key.bech32,
          );
        break;
      case "cli":
        this._walletSecret = WalletStaticMethods.signingKeyToHexes(
          options.key.payment,
          options.key.stake ?? "f0".repeat(32),
        );
        break;
      case "bip32Bytes":
        this._walletSecret = WalletStaticMethods.bip32BytesToPrivateKeyHex(
          options.key.bip32Bytes,
        );
        break;
    }
  }

  async init(): Promise<void> {
    await Crypto.ready();
    this.cryptoIsReady = true;
  }

  getAccount(accountIndex = 0, keyIndex = 0): Account {
    if (this._walletSecret == undefined)
      throw new Error("[EmbeddedWallet] No keys initialized");

    const { paymentKey, stakeKey, dRepKey } = buildKeys(
      this._walletSecret,
      accountIndex,
      keyIndex,
    );

    const { baseAddress, enterpriseAddress, rewardAddress } =
      WalletStaticMethods.getAddresses(paymentKey, stakeKey, this._networkId);

    let _account: Account = {
      baseAddress: baseAddress,
      enterpriseAddress: enterpriseAddress,
      rewardAddress: rewardAddress,

      baseAddressBech32: baseAddress.toBech32(),
      enterpriseAddressBech32: enterpriseAddress.toBech32(),
      rewardAddressBech32: rewardAddress.toBech32(),

      paymentKey: paymentKey,
      stakeKey: stakeKey,
      paymentKeyHex: paymentKey.hex(),
      stakeKeyHex: stakeKey.hex(),
    };

    if (dRepKey) {
      const { pubDRepKey, dRepIDBech32, dRepIDHash, dRepIDCip105 } =
        WalletStaticMethods.getDRepKey(dRepKey, this._networkId);
      _account.drepKey = dRepKey;
      _account.pubDRepKey = pubDRepKey;
      _account.dRepIDBech32 = dRepIDBech32;
      _account.dRepIDHash = dRepIDHash;
      _account.dRepIDCip105 = dRepIDCip105;
    }

    return _account;
  }

  /**
   * Get wallet network ID.
   *
   * @returns network ID
   */
  getNetworkId(): number {
    return this._networkId;
  }

  /**
   * This endpoint utilizes the [CIP-8 - Message Signing](https://cips.cardano.org/cips/cip8/) to sign arbitrary data, to verify the data was signed by the owner of the private key.
   *
   * @param address - bech32 address to sign the data with
   * @param payload - the data to be signed
   * @param accountIndex account index (default: 0)
   * @returns a signature
   */
  signData(
    address: string,
    payload: string,
    accountIndex = 0,
    keyIndex = 0,
  ): DataSignature {
    try {
      const { baseAddress, enterpriseAddress, rewardAddress, paymentKey } =
        this.getAccount(accountIndex, keyIndex);

      const foundAddress = [baseAddress, enterpriseAddress, rewardAddress].find(
        (a) => a.toBech32() === address,
      );

      if (foundAddress === undefined)
        throw new Error(
          `[EmbeddedWallet] Address: ${address} doesn't belong to this account.`,
        );

      // todo tw
      return signData(payload, {
        address: Address.fromBech32(address),
        key: paymentKey,
      });
    } catch (error) {
      throw new Error(
        `[EmbeddedWallet] An error occurred during signData: ${error}.`,
      );
    }
  }

  /**
   * This endpoints sign the provided transaction (unsignedTx) with the private key of the owner.
   *
   * @param unsignedTx - a transaction in CBOR
   * @param accountIndex account index (default: 0)
   * @param keyIndex key index (default: 0)
   * @param accountType - type of the account (default: payment)
   * @returns VkeyWitness
   */
  signTx(
    unsignedTx: string,
    accountIndex = 0,
    keyIndex = 0,
    accountType: AccountType = "payment",
  ): VkeyWitness {
    try {
      const txHash = deserializeTxHash(resolveTxHash(unsignedTx));

      const { paymentKey, stakeKey, drepKey } = this.getAccount(
        accountIndex,
        keyIndex,
      );

      let key = paymentKey;
      if (accountType === "stake") {
        key = stakeKey;
      } else if (accountType === "drep") {
        if (!drepKey) throw new Error("DRep key not found");
        key = drepKey;
      }

      const vKeyWitness = new VkeyWitness(
        key.toPublic().hex(),
        key.sign(HexBlob(txHash)).hex(),
      );

      return vKeyWitness;
    } catch (error) {
      throw new Error(
        `[EmbeddedWallet] An error occurred during signTx: ${error}.`,
      );
    }
  }
}
