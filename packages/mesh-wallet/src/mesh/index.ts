import type {
  Asset,
  AssetExtended,
  DataSignature,
  IWallet,
  UTxO,
} from "@meshsdk/common";
import {
  IFetcher,
  ISubmitter,
  POLICY_ID_LENGTH,
  resolveFingerprint,
  toUTF8,
} from "@meshsdk/common";
import {
  Address,
  buildBaseAddress,
  buildEnterpriseAddress,
  buildRewardAddress,
  deserializeTx,
  DRepID,
  Ed25519KeyHashHex,
  fromTxUnspentOutput,
  Hash28ByteBase16,
  resolvePrivateKey,
  toAddress,
  toTxUnspentOutput,
  TransactionUnspentOutput,
} from "@meshsdk/core-cst";
import { Transaction } from "@meshsdk/transaction";

import { AccountType, EmbeddedWallet } from "../embedded";
import { GetAddressType } from "../types";

export type CreateMeshWalletOptions = {
  networkId: 0 | 1;
  fetcher?: IFetcher;
  submitter?: ISubmitter;
  key:
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
      }
    | {
        type: "address";
        address: string;
      };
  accountIndex?: number;
  keyIndex?: number;
  accountType?: AccountType;
};

/**
 * Mesh Wallet provides a set of APIs to interact with the blockchain. This wallet is compatible with Mesh transaction builders.
 *
 * There are 4 types of keys that can be used to create a wallet:
 * - root: A private key in bech32 format, generally starts with `xprv1`
 * - cli: CLI generated keys starts with `5820`. Payment key is required, and the stake key is optional.
 * - mnemonic: A list of 24 words
 * - address: A bech32 address that can be used to create a read-only wallet, generally starts with `addr` or `addr_test1`
 *
 * ```javascript
 * import { MeshWallet, BlockfrostProvider } from '@meshsdk/core';
 *
 * const provider = new BlockfrostProvider('<BLOCKFROST_API_KEY>');
 *
 * const wallet = new MeshWallet({
 *   networkId: 0,
 *   fetcher: provider,
 *   submitter: provider,
 *   key: {
 *     type: 'mnemonic',
 *     words: ["solution","solution","solution","solution","solution",","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution"],
 *   },
 * });
 * ```
 *
 * Please call `await wallet.init()` after creating the wallet to fetch the addresses from the wallet.
 */
export class MeshWallet implements IWallet {
  private readonly _keyType: string;
  private readonly _accountType: AccountType = "payment";
  private readonly _wallet: EmbeddedWallet | null;
  private readonly _accountIndex: number = 0;
  private readonly _keyIndex: number = 0;
  private readonly _fetcher?: IFetcher;
  private readonly _submitter?: ISubmitter;
  private readonly _networkId: 0 | 1;
  addresses: {
    baseAddress?: Address;
    enterpriseAddress?: Address;
    rewardAddress?: Address;
    baseAddressBech32?: string;
    enterpriseAddressBech32?: string;
    rewardAddressBech32?: string;
    pubDRepKey?: string;
    dRepIDBech32?: DRepID;
    dRepIDHash?: Ed25519KeyHashHex;
    dRepIDCip105?: string;
  } = {};

  constructor(options: CreateMeshWalletOptions) {
    this._networkId = options.networkId;
    this._keyType = options.key.type;

    if (options.fetcher) this._fetcher = options.fetcher;
    if (options.submitter) this._submitter = options.submitter;
    if (options.accountIndex) this._accountIndex = options.accountIndex;
    if (options.keyIndex) this._keyIndex = options.keyIndex;
    if (options.accountType) this._accountType = options.accountType;

    switch (options.key.type) {
      case "root":
        this._wallet = new EmbeddedWallet({
          networkId: options.networkId,
          key: {
            type: "root",
            bech32: options.key.bech32,
          },
        });
        break;
      case "cli":
        this._wallet = new EmbeddedWallet({
          networkId: options.networkId,
          key: {
            type: "cli",
            payment: options.key.payment,
            stake: options.key.stake,
          },
        });
        break;
      case "mnemonic":
        this._wallet = new EmbeddedWallet({
          networkId: options.networkId,
          key: {
            type: "mnemonic",
            words: options.key.words,
          },
        });
        break;
      case "bip32Bytes":
        this._wallet = new EmbeddedWallet({
          networkId: options.networkId,
          key: {
            type: "bip32Bytes",
            bip32Bytes: options.key.bip32Bytes,
          },
        });
        break;
      case "address":
        this._wallet = null;
        this.buildAddressFromBech32Address(options.key.address);
        break;
    }
  }

  /**
   * Initializes the wallet. This is a required call as fetching addresses from the wallet is an async operation.
   * @returns void
   */
  async init() {
    if (this._wallet && !this._wallet.cryptoIsReady) {
      await this._wallet.init();
      this.getAddressesFromWallet(this._wallet);
    }
  }

  /**
   * Returns all derived addresses from the wallet.
   * @returns a list of addresses
   */
  getAddresses() {
    return this.addresses;
  }

  /**
   * Returns a list of assets in the wallet. This API will return every assets in the wallet. Each asset is an object with the following properties:
   * - A unit is provided to display asset's name on the user interface.
   * - A quantity is provided to display asset's quantity on the user interface.
   *
   * @returns a list of assets and their quantities
   */
  async getBalance(): Promise<Asset[]> {
    await this.init();

    const utxos = await this.getUnspentOutputs();

    const assets = new Map<string, number>();
    utxos.map((utxo) => {
      const _utxo = fromTxUnspentOutput(utxo);
      _utxo.output.amount.map((asset) => {
        const assetId = asset.unit;
        const amount = Number(asset.quantity);
        if (assets.has(assetId)) {
          const quantity = assets.get(assetId)!;
          assets.set(assetId, quantity + amount);
        } else {
          assets.set(assetId, amount);
        }
      });
    });

    const arrayAssets: Asset[] = Array.from(assets, ([unit, quantity]) => ({
      unit,
      quantity: quantity.toString(),
    }));

    return arrayAssets;
  }

  /**
   * Returns an address owned by the wallet that should be used as a change address to return leftover assets during transaction creation back to the connected wallet.
   *
   * @returns an address
   */
  async getChangeAddress(
    addressType: GetAddressType = "payment",
  ): Promise<string> {
    await this.init();

    if (this.addresses.baseAddressBech32 && addressType === "payment") {
      return this.addresses.baseAddressBech32;
    }
    return this.addresses.enterpriseAddressBech32!;
  }

  /**
   * This function shall return a list of one or more UTXOs (unspent transaction outputs) controlled by the wallet that are required to reach AT LEAST the combined ADA value target specified in amount AND the best suitable to be used as collateral inputs for transactions with plutus script inputs (pure ADA-only UTXOs).
   *
   * If this cannot be attained, an error message with an explanation of the blocking problem shall be returned. NOTE: wallets are free to return UTXOs that add up to a greater total ADA value than requested in the amount parameter, but wallets must never return any result where UTXOs would sum up to a smaller total ADA value, instead in a case like that an error message must be returned.
   *
   * @param addressType - the type of address to fetch UTXOs from (default: payment)
   * @returns a list of UTXOs
   */

  async getCollateral(
    addressType: GetAddressType = "payment",
  ): Promise<UTxO[]> {
    await this.init();

    const utxos = await this.getCollateralUnspentOutput(addressType);
    return utxos.map((utxo, i) => {
      return fromTxUnspentOutput(utxo);
    });
  }

  /**
   * Return a list of supported CIPs of the wallet.
   *
   * @returns a list of CIPs
   */
  async getExtensions(): Promise<number[]> {
    return [];
  }

  /**
   * Get a list of UTXOs to be used as collateral inputs for transactions with plutus script inputs.
   *
   * This is used in transaction building.
   *
   * @param addressType - the type of address to fetch UTXOs from (default: payment)
   * @returns a list of UTXOs
   */
  async getCollateralUnspentOutput(
    addressType: GetAddressType = "payment",
  ): Promise<TransactionUnspentOutput[]> {
    await this.init();

    const utxos = await this.getUnspentOutputs(addressType);

    // find utxos that are pure ADA-only
    const pureAdaUtxos = utxos.filter((utxo) => {
      return utxo.output().amount().multiasset() === undefined;
    });

    // sort utxos by their lovelace amount
    pureAdaUtxos.sort((a, b) => {
      return (
        Number(a.output().amount().coin()) - Number(b.output().amount().coin())
      );
    });

    // return the smallest utxo but not less than 5000000 lovelace
    for (const utxo of pureAdaUtxos) {
      if (Number(utxo.output().amount().coin()) >= 5000000) {
        return [utxo];
      }
    }

    return [];
  }

  /**
   * The connected wallet account provides the account's public DRep Key, derivation as described in CIP-0105.
   * These are used by the client to identify the user's on-chain CIP-1694 interactions, i.e. if a user has registered to be a DRep.
   *
   * @returns DRep object
   */
  async getDRep(): Promise<
    | {
        publicKey: string;
        publicKeyHash: string;
        dRepIDCip105: string;
      }
    | undefined
  > {
    await this.init();

    if (
      this.addresses.pubDRepKey &&
      this.addresses.dRepIDHash &&
      this.addresses.dRepIDCip105
    )
      return {
        publicKey: this.addresses.pubDRepKey,
        publicKeyHash: this.addresses.dRepIDHash,
        dRepIDCip105: this.addresses.dRepIDCip105,
      };

    return undefined;
  }
  /**
   * Returns the network ID of the currently connected account. 0 is testnet and 1 is mainnet but other networks can possibly be returned by wallets. Those other network ID values are not governed by CIP-30. This result will stay the same unless the connected account has changed.
   *
   * @returns network ID
   */
  async getNetworkId(): Promise<number> {
    return this._networkId;
  }

  /**
   * Returns a list of reward addresses owned by the wallet. A reward address is a stake address that is used to receive rewards from staking, generally starts from `stake` prefix.
   *
   * @returns a list of reward addresses
   */
  async getRewardAddresses(): Promise<string[]> {
    return [this.addresses.rewardAddressBech32!];
  }

  /**
   * Returns a list of unused addresses controlled by the wallet.
   *
   * @returns a list of unused addresses
   */
  async getUnusedAddresses(): Promise<string[]> {
    return [await this.getChangeAddress()];
  }

  /**
   * Returns a list of used addresses controlled by the wallet.
   *
   * @returns a list of used addresses
   */
  async getUsedAddresses(): Promise<string[]> {
    return [await this.getChangeAddress()];
  }

  /**
   * Get a list of UTXOs to be used for transaction building.
   *
   * This is used in transaction building.
   *
   * @param addressType - the type of address to fetch UTXOs from (default: payment)
   * @returns a list of UTXOs
   */
  async getUsedUTxOs(
    addressType: GetAddressType = "payment",
  ): Promise<TransactionUnspentOutput[]> {
    await this.init();
    return await this.getUnspentOutputs(addressType);
  }

  /**
   * Return a list of all UTXOs (unspent transaction outputs) controlled by the wallet.
   *
   * @param addressType - the type of address to fetch UTXOs from (default: payment)
   * @returns a list of UTXOs
   */
  async getUtxos(addressType: GetAddressType = "payment"): Promise<UTxO[]> {
    const utxos = await this.getUsedUTxOs(addressType);
    return utxos.map((c) => fromTxUnspentOutput(c));
  }

  /**
   * This endpoint utilizes the [CIP-8 - Message Signing](https://cips.cardano.org/cips/cip8/) to sign arbitrary data, to verify the data was signed by the owner of the private key.
   *
   * @param payload - the payload to sign
   * @param address - the address to use for signing (optional)
   * @returns a signature
   */
  async signData(payload: string, address?: string): Promise<DataSignature> {
    await this.init();

    if (!this._wallet) {
      throw new Error(
        "[MeshWallet] Read only wallet does not support signing data.",
      );
    }
    if (address === undefined) {
      address = await this.getChangeAddress()!;
    }
    return this._wallet.signData(
      address,
      payload,
      this._accountIndex,
      this._keyIndex,
    );
  }

  /**
   * Requests user to sign the provided transaction (tx). The wallet should ask the user for permission, and if given, try to sign the supplied body and return a signed transaction. partialSign should be true if the transaction provided requires multiple signatures.
   *
   * @param unsignedTx - a transaction in CBOR
   * @param partialSign - if the transaction is partially signed (default: false)
   * @returns a signed transaction in CBOR
   */
  async signTx(unsignedTx: string, partialSign = false): Promise<string> {
    await this.init();

    if (!this._wallet) {
      throw new Error(
        "[MeshWallet] Read only wallet does not support signing data.",
      );
    }

    const tx = deserializeTx(unsignedTx);
    if (
      !partialSign &&
      tx.witnessSet().vkeys() !== undefined &&
      tx.witnessSet().vkeys()!.size() !== 0
    )
      throw new Error(
        "Signatures already exist in the transaction in a non partial sign call",
      );

    const newSignatures = this._wallet.signTx(
      unsignedTx,
      this._accountIndex,
      this._keyIndex,
      this._accountType,
    );

    let signedTx = EmbeddedWallet.addWitnessSets(unsignedTx, [newSignatures]);
    return signedTx;
  }

  /**
   * Experimental feature - sign multiple transactions at once.
   *
   * @param unsignedTxs - array of unsigned transactions in CborHex string
   * @param partialSign - if the transactions are signed partially
   * @returns array of signed transactions CborHex string
   */
  async signTxs(unsignedTxs: string[], partialSign = false): Promise<string[]> {
    await this.init();

    if (!this._wallet) {
      throw new Error(
        "[MeshWallet] Read only wallet does not support signing data.",
      );
    }

    const signedTxs: string[] = [];

    for (const unsignedTx of unsignedTxs) {
      const signedTx = await this.signTx(unsignedTx, partialSign);
      signedTxs.push(signedTx);
    }

    return signedTxs;
  }

  /**
   * Submits the signed transaction to the blockchain network.
   *
   * As wallets should already have this ability to submit transaction, we allow apps to request that a transaction be sent through it. If the wallet accepts the transaction and tries to send it, it shall return the transaction ID for the app to track. The wallet can return error messages or failure if there was an error in sending it.
   *
   * @param tx - a signed transaction in CBOR
   * @returns a transaction hash
   */
  async submitTx(tx: string): Promise<string> {
    if (!this._submitter) {
      throw new Error(
        "[MeshWallet] Submitter is required to submit transactions. Please provide a submitter.",
      );
    }
    return this._submitter.submitTx(tx);
  }

  /**
   * Get a used address of type Address from the wallet.
   *
   * This is used in transaction building.
   *
   * @param addressType - the type of address to fetch UTXOs from (default: payment)
   * @returns an Address object
   */
  getUsedAddress(addressType: GetAddressType = "payment"): Address {
    if (this.addresses.baseAddressBech32 && addressType === "payment") {
      return toAddress(this.addresses.baseAddressBech32);
    } else {
      return toAddress(this.addresses.enterpriseAddressBech32!);
    }
  }

  /**
   * Get a list of UTXOs to be used for transaction building.
   *
   * This is used in transaction building.
   *
   * @param addressType - the type of address to fetch UTXOs from (default: payment)
   * @returns a list of UTXOs
   */
  async getUnspentOutputs(
    addressType: GetAddressType = "payment",
  ): Promise<TransactionUnspentOutput[]> {
    if (!this._fetcher) {
      throw new Error(
        "[MeshWallet] Fetcher is required to fetch UTxOs. Please provide a fetcher.",
      );
    }

    const utxos = await this._fetcher.fetchAddressUTxOs(
      this.addresses.baseAddressBech32 && addressType == "payment"
        ? this.addresses.baseAddressBech32!
        : this.addresses.enterpriseAddressBech32!,
    );

    return utxos.map((utxo) => toTxUnspentOutput(utxo));
  }

  /**
   * A helper function to get the assets in the wallet.
   *
   * @returns a list of assets
   */
  async getAssets(): Promise<AssetExtended[]> {
    const balance = await this.getBalance();
    return balance
      .filter((v) => v.unit !== "lovelace")
      .map((v) => {
        const policyId = v.unit.slice(0, POLICY_ID_LENGTH);
        const assetName = v.unit.slice(POLICY_ID_LENGTH);
        const fingerprint = resolveFingerprint(policyId, assetName);

        return {
          unit: v.unit,
          policyId,
          assetName: toUTF8(assetName),
          fingerprint,
          quantity: v.quantity,
        };
      });
  }

  /**
   * A helper function to get the lovelace balance in the wallet.
   *
   * @returns lovelace balance
   */
  async getLovelace(): Promise<string> {
    const balance = await this.getBalance();
    const nativeAsset = balance.find((v) => v.unit === "lovelace");

    return nativeAsset !== undefined ? nativeAsset.quantity : "0";
  }

  /**
   * A helper function to get the assets of a specific policy ID in the wallet.
   *
   * @param policyId
   * @returns a list of assets
   */
  async getPolicyIdAssets(policyId: string): Promise<AssetExtended[]> {
    const assets = await this.getAssets();
    return assets.filter((v) => v.policyId === policyId);
  }

  /**
   * A helper function to get the policy IDs of all the assets in the wallet.
   *
   * @returns a list of policy IDs
   */
  async getPolicyIds(): Promise<string[]> {
    const balance = await this.getBalance();
    return Array.from(
      new Set(balance.map((v) => v.unit.slice(0, POLICY_ID_LENGTH))),
    ).filter((p) => p !== "lovelace");
  }

  async getRegisteredPubStakeKeys(): Promise<
    | {
        pubStakeKeys: string[];
        pubStakeKeyHashes: string[];
      }
    | undefined
  > {
    console.warn("Not implemented yet");
    return undefined;
  }

  async getUnregisteredPubStakeKeys(): Promise<
    | {
        pubStakeKeys: string[];
        pubStakeKeyHashes: string[];
      }
    | undefined
  > {
    console.warn("Not implemented yet");
    return undefined;
  }

  /**
   * A helper function to create a collateral input for a transaction.
   *
   * @returns a transaction hash
   */
  async createCollateral(): Promise<string> {
    const tx = new Transaction({ initiator: this });
    tx.sendLovelace(await this.getChangeAddress(), "5000000");
    const unsignedTx = await tx.build();
    const signedTx = await this.signTx(unsignedTx);
    const txHash = await this.submitTx(signedTx);
    return txHash;
  }

  getPubDRepKey(): {
    pubDRepKey: string | undefined;
    dRepIDBech32: string | undefined;
    dRepIDHash: string | undefined;
    dRepIDCip105: string | undefined;
  } {
    return {
      pubDRepKey: this.addresses.pubDRepKey,
      dRepIDBech32: this.addresses.dRepIDBech32,
      dRepIDHash: this.addresses.dRepIDHash,
      dRepIDCip105: this.addresses.dRepIDCip105,
    };
  }

  /**
   * Generate mnemonic or private key
   *
   * @param privateKey return private key if true
   * @returns a transaction hash
   */
  static brew(privateKey = false, strength = 256): string[] | string {
    const mnemonic = EmbeddedWallet.generateMnemonic(strength);

    if (privateKey) {
      return resolvePrivateKey(mnemonic);
    }

    return mnemonic;
  }

  private getAddressesFromWallet(wallet: EmbeddedWallet) {
    const account = wallet.getAccount(this._accountIndex, this._keyIndex);

    this.addresses = {
      baseAddress: account.baseAddress,
      enterpriseAddress: account.enterpriseAddress,
      rewardAddress: account.rewardAddress,
      baseAddressBech32: account.baseAddressBech32,
      enterpriseAddressBech32: account.enterpriseAddressBech32,
      rewardAddressBech32: account.rewardAddressBech32,

      pubDRepKey: account.pubDRepKey,
      dRepIDBech32: account.dRepIDBech32,
      dRepIDHash: account.dRepIDHash,
      dRepIDCip105: account.dRepIDCip105,
    };
  }

  private buildAddressFromBech32Address(address: string) {
    let pubKeyHash = undefined;
    let stakeKeyHash = undefined;

    const baseAddress = Address.fromBech32(address).asBase();
    if (baseAddress) {
      pubKeyHash = baseAddress.getPaymentCredential().hash;
      stakeKeyHash = baseAddress.getStakeCredential().hash;
    }
    const enterpriseAddress = Address.fromBech32(address).asEnterprise();
    if (enterpriseAddress) {
      pubKeyHash = enterpriseAddress.getPaymentCredential().hash;
    }

    const rewardAddress = Address.fromBech32(address).asReward();
    if (rewardAddress) {
      stakeKeyHash = rewardAddress.getPaymentCredential().hash;
    }

    if (pubKeyHash && stakeKeyHash) {
      this.addresses.baseAddress = buildBaseAddress(
        this._networkId,
        Hash28ByteBase16.fromEd25519KeyHashHex(Ed25519KeyHashHex(pubKeyHash)),
        Hash28ByteBase16.fromEd25519KeyHashHex(
          Ed25519KeyHashHex(Ed25519KeyHashHex(stakeKeyHash)),
        ),
      ).toAddress();
      this.addresses.baseAddressBech32 = this.addresses.baseAddress.toBech32();
    }

    if (pubKeyHash) {
      this.addresses.enterpriseAddress = buildEnterpriseAddress(
        this._networkId,
        Hash28ByteBase16.fromEd25519KeyHashHex(Ed25519KeyHashHex(pubKeyHash)),
      ).toAddress();
      this.addresses.enterpriseAddressBech32 =
        this.addresses.enterpriseAddress.toBech32();
    }

    if (stakeKeyHash) {
      this.addresses.rewardAddress = buildRewardAddress(
        this._networkId,
        Hash28ByteBase16.fromEd25519KeyHashHex(Ed25519KeyHashHex(stakeKeyHash)),
      ).toAddress();

      this.addresses.rewardAddressBech32 =
        this.addresses.rewardAddress.toBech32();
    }
  }
}
