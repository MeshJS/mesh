import { Cardano, Serialization, setInConwayEra } from "@cardano-sdk/core";

import { DataSignature, IFetcher, ISubmitter, UTxO } from "@meshsdk/common";

import { InMemoryBip32 } from "../../../bip32/in-memory-bip32";
import { ICardanoWallet } from "../../../interfaces/cardano-wallet";
import { ISecretManager } from "../../../interfaces/secret-manager";
import { toTxUnspentOutput } from "../../../utils/conerter";
import { mergeValue } from "../../../utils/value";
import { AddressType } from "../../address/cardano-address";
import {
  AddressManager,
  CredentialSource,
} from "../../address/single-address-manager";
import { CardanoSigner } from "../../signer/cardano-signer";
import { getTransactionRequiredSigners } from "../../utils/transaction-signers";

export type { CredentialSource };

export type WalletAddressType = AddressType.Base | AddressType.Enterprise;

/**
 * Configuration for creating a BaseCardanoWallet instance.
 */
export interface BaseCardanoWalletConfig {
  /**
   * The secret manager instance that provides access to private keys and signing capabilities.
   */
  secretManager: ISecretManager;
  /**
   * The network ID (0 for testnet, 1 for mainnet).
   */
  networkId: number;
  /**
   * Optional custom credential source for the stake credential.
   * If not provided, the wallet will derive stake credentials using default derivation paths.
   */
  customStakeCredentialSource?: CredentialSource;
  /**
   * Optional custom credential source for the DRep credential.
   * If not provided, the wallet will derive DRep credentials using default derivation paths.
   */
  customDrepCredentialSource?: CredentialSource;
  /**
   * The type of wallet address to use (Base or Enterprise).
   * Base addresses include staking capabilities, while Enterprise addresses do not.
   */
  walletAddressType: WalletAddressType;
  /**
   * Optional fetcher instance for querying blockchain data (UTxOs, protocol parameters, etc.).
   */
  fetcher?: IFetcher;
  /**
   * Optional submitter instance for submitting transactions to the blockchain.
   */
  submitter?: ISubmitter;
}

export class BaseCardanoWallet implements ICardanoWallet {
  protected networkId: number;
  protected addressManager: AddressManager;
  protected fetcher?: IFetcher;
  protected submitter?: ISubmitter;
  protected walletAddressType: WalletAddressType;

  protected constructor(
    networkId: number,
    addressManager: AddressManager,
    walletAddressType: WalletAddressType,
    fetcher?: IFetcher,
    submitter?: ISubmitter,
  ) {
    setInConwayEra(true);
    this.networkId = networkId;
    this.addressManager = addressManager;
    this.fetcher = fetcher;
    this.submitter = submitter;
    this.walletAddressType = walletAddressType;
  }

  static async create(
    config: BaseCardanoWalletConfig,
  ): Promise<BaseCardanoWallet> {
    const addressManager = await AddressManager.create({
      secretManager: config.secretManager,
      networkId: config.networkId,
      customStakeCredentialSource: config.customStakeCredentialSource,
      customDrepCredentialSource: config.customDrepCredentialSource,
    });

    return new BaseCardanoWallet(
      config.networkId,
      addressManager,
      config.walletAddressType,
      config.fetcher,
      config.submitter,
    );
  }

  /**
   * Create a BaseCardanoWallet instance from a Bip32 root in Bech32 format.
   * @param config The configuration object
   * @returns {Promise<BaseCardanoWallet>} A promise that resolves to a BaseCardanoWallet instance
   */
  static async fromBip32Root(
    config: Omit<BaseCardanoWalletConfig, "secretManager"> & {
      bech32: string;
    },
  ): Promise<BaseCardanoWallet> {
    const bip32 = InMemoryBip32.fromBech32(config.bech32);
    return BaseCardanoWallet.create({
      secretManager: bip32,
      networkId: config.networkId,
      customStakeCredentialSource: config.customStakeCredentialSource,
      customDrepCredentialSource: config.customDrepCredentialSource,
      walletAddressType: config.walletAddressType,
      fetcher: config.fetcher,
      submitter: config.submitter,
    });
  }

  /**
   * Create a BaseCardanoWallet instance from a Bip32 root in hex format.
   * @param config The configuration object
   * @returns {Promise<BaseCardanoWallet>} A promise that resolves to a BaseCardanoWallet instance
   */
  static async fromBip32RootHex(
    config: Omit<BaseCardanoWalletConfig, "secretManager"> & {
      hex: string;
    },
  ): Promise<BaseCardanoWallet> {
    const bip32 = InMemoryBip32.fromKeyHex(config.hex);
    return BaseCardanoWallet.create({
      secretManager: bip32,
      networkId: config.networkId,
      customStakeCredentialSource: config.customStakeCredentialSource,
      customDrepCredentialSource: config.customDrepCredentialSource,
      walletAddressType: config.walletAddressType,
      fetcher: config.fetcher,
      submitter: config.submitter,
    });
  }

  /**
   * Create a BaseCardanoWallet instance from a mnemonic phrase.
   * @param config The configuration object
   * @returns {Promise<BaseCardanoWallet>} A promise that resolves to a BaseCardanoWallet instance
   */
  static async fromMnemonic(
    config: Omit<BaseCardanoWalletConfig, "secretManager"> & {
      mnemonic: string[];
      password?: string;
    },
  ): Promise<BaseCardanoWallet> {
    const bip32 = await InMemoryBip32.fromMnemonic(
      config.mnemonic,
      config.password,
    );
    return BaseCardanoWallet.create({
      secretManager: bip32,
      networkId: config.networkId,
      customStakeCredentialSource: config.customStakeCredentialSource,
      customDrepCredentialSource: config.customDrepCredentialSource,
      walletAddressType: config.walletAddressType,
      fetcher: config.fetcher,
      submitter: config.submitter,
    });
  }

  /**
   * Submit a transaction to the network, using the submitter instance.
   * @param tx The transaction in CBOR hex format
   * @returns {Promise<string>} A promise that resolves to the transaction ID
   */
  async submitTx(tx: string): Promise<string> {
    if (!this.submitter) {
      throw new Error("[CardanoWallet] No submitter provided");
    }
    return await this.submitter.submitTx(tx);
  }

  /**
   * Get the network ID.
   * @returns {number} The network ID
   */
  getNetworkId(): number {
    return this.networkId;
  }

  /**
   * Get the UTxOs for the wallet.
   *
   * NOTE: This method is only an approximation to CIP-30 getUtxos, as this wallet is completely
   * stateless and does not track which UTxOs are specifically set as collateral. Which means that there
   * will be overlap between getUtxos() and getCollateral() results. This can result in the collateral being
   * spent between transactions.
   * @returns {Promise<string[]>} A promise that resolves to an array of UTxOs in CBOR hex format
   */
  async getUtxos(): Promise<string[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const utxos = await this.fetchAccountUtxos();
    return utxos.map((utxo) => toTxUnspentOutput(utxo).toCbor());
  }

  /**
   * Get the collateral UTxOs for the wallet.
   *
   * NOTE: This method is only an approximation to CIP-30 getCollateral, as this wallet is completely
   * stateless and does not track which UTxOs are specifically set as collateral. Which means that there
   * will be overlap between getUtxos() and getCollateral() results.
   *
   * The basic strategy is to return the smallest pure ADA UTxO that is at least 5 ADA belonging to the wallet.
   * @returns {Promise<string[]>} A promise that resolves to an array of UTxOs in CBOR hex format
   */
  async getCollateral(): Promise<string[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const utxos = await this.fetchAccountUtxos();
    const cardanoUtxos = utxos.map((utxo) => toTxUnspentOutput(utxo));

    // find utxos that are pure ADA-only
    const pureAdaUtxos = cardanoUtxos.filter((utxo) => {
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
        return [utxo.toCbor()];
      }
    }
    return [];
  }

  /**
   * Get the balance of the wallet.
   *
   * NOTE: This method is only an approximation to CIP-30 getBalance, as this wallet is completely
   * stateless and does not track which UTxOs are specifically set as collateral. Which means the balance
   * returned includes all UTxOs, including those that may be used as collateral.
   * @returns {Promise<string>} A promise that resolves to the balance in CBOR hex format
   */
  async getBalance(): Promise<string> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const utxos = await this.fetchAccountUtxos();
    const cardanoUtxos = utxos.map((utxo) => toTxUnspentOutput(utxo));
    let total = new Serialization.Value(0n);
    for (const utxo of cardanoUtxos) {
      total = mergeValue(total, utxo.output().amount());
    }
    return total.toCbor();
  }

  /**
   * Get the used addresses for the wallet.
   *
   * NOTE: This method completely deviates from CIP-30 getUsedAddresses, as this wallet is stateless
   * it is impossible to track which addresses have been used. This method simply returns the wallet's main address.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @returns {Promise<string[]>} A promise that resolves to an array of used addresses in hex format
   */
  async getUsedAddresses(): Promise<string[]> {
    //TODO: Should iterate over all utxos to get the used addresses
    const address = await this.addressManager.getNextAddress(
      this.walletAddressType,
    );
    return [address.getAddressHex()];
  }

  /**
   * Get the unused addresses for the wallet.
   *
   * NOTE: This method completely deviates from CIP-30 getUnusedAddresses, as this wallet is stateless
   * it is impossible to track which addresses have been used. This method simply returns the wallet's main address.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @returns {Promise<string[]>} A promise that resolves to an array of unused addresses in hex format
   */
  async getUnusedAddresses(): Promise<string[]> {
    const address = await this.addressManager.getNextAddress(
      this.walletAddressType,
    );
    return [address.getAddressHex()];
  }

  /**
   * Get the change address for the wallet.
   * NOTE: This method deviates from CIP-30 getChangeAddress, as this wallet is stateless
   * it does not track which addresses has been previously used as change address. This method simply
   * returns the wallet's main address.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @returns {Promise<string>} A promise that resolves to the change address in hex format
   */
  async getChangeAddress(): Promise<string> {
    const address = await this.addressManager.getChangeAddress(
      this.walletAddressType,
    );
    return address.getAddressHex();
  }

  /**
   * Get the reward address for the wallet.
   * @returns {Promise<string>} A promise that resolves to the reward address in hex format
   */
  async getRewardAddress(): Promise<string> {
    const rewardAddress = await this.addressManager.getRewardAccount();
    return rewardAddress.getAddressHex();
  }

  /**
   * Sign a transaction with the wallet.
   *
   * NOTE: This method requires a fetcher to resolve input UTxOs for determining required signers.
   *
   * It is also only an approximation to CIP-30 signTx, as this wallet is stateless and does not repeatedly
   * derive keys, it is unable to sign for multiple derived key indexes.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @param tx The transaction in CBOR hex format
   * @returns A promise that resolves to a witness set with the signatures in CBOR hex format
   */

  async signTx(tx: string, partialSign: boolean = false): Promise<string> {
    if (!this.fetcher) {
      throw new Error(
        "[CardanoWallet] No fetcher provided, wallet sign tx does not behave correctly without a fetcher to resolve inputs. If you need to blindly sign a tx, use the CardanoSigner class directly.",
      );
    }
    const transaction = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(tx),
    );
    const requiredSigners = await getTransactionRequiredSigners(
      transaction,
      this.fetcher,
    );

    const signersMap =
      await this.addressManager.getCredentialsSigners(requiredSigners);

    if (!partialSign) {
      if (requiredSigners.size !== signersMap.size) {
        throw new Error("[CardanoWallet] Not all required signers found");
      }
    }

    const signers = Array.from(signersMap.values());
    return await CardanoSigner.signTx(tx, signers, false);
  }

  async signData(data: string, addressHex?: string): Promise<DataSignature> {
    let targetAddressHex = addressHex;
    if (!targetAddressHex) {
      const address = await this.addressManager.getNextAddress(
        this.walletAddressType,
      );
      targetAddressHex = address.getAddressHex();
    }

    const address = Cardano.Address.fromString(targetAddressHex);
    if (!address) {
      throw new Error("[CardanoWallet] Invalid address");
    }
    const addressProps = address.getProps();

    let credentialHash: string;
    if (
      addressProps.type === Cardano.AddressType.RewardKey &&
      addressProps.delegationPart
    ) {
      credentialHash = addressProps.delegationPart.hash;
    } else if (addressProps.paymentPart) {
      credentialHash = addressProps.paymentPart.hash;
    } else {
      throw new Error("[CardanoWallet] No credential found in address");
    }

    const signersMap = await this.addressManager.getCredentialsSigners(
      new Set([credentialHash]),
    );
    const signer = signersMap.get(credentialHash);

    if (!signer) {
      throw new Error(
        `[CardanoWallet] No signer found for credential hash: ${credentialHash}`,
      );
    }

    return await CardanoSigner.signData(data, targetAddressHex, signer);
  }

  public async fetchAccountUtxos(): Promise<UTxO[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }

    const addresses: string[] = [];

    // Get base address
    try {
      const baseAddress = await this.addressManager.getNextAddress(
        AddressType.Base,
      );
      addresses.push(baseAddress.getAddressBech32());
    } catch (error) {
      // If base address is not available (e.g., no stake credential), continue
    }

    // Get enterprise address
    try {
      const enterpriseAddress = await this.addressManager.getNextAddress(
        AddressType.Enterprise,
      );
      addresses.push(enterpriseAddress.getAddressBech32());
    } catch (error) {
      // If enterprise address is not available, continue
    }

    const utxos: UTxO[] = [];
    for (const addr of addresses) {
      const fetchedUtxos = await this.fetcher.fetchAddressUTxOs(addr);
      utxos.push(...fetchedUtxos);
    }
    return utxos;
  }
}
