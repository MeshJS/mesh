import {
  CachedFetcher,
  DataSignature,
  IFetcher,
  ISigner,
  ISubmitter,
} from "@meshsdk/common";
import {
  Address,
  deserializeTx,
  Serialization,
  toAddress,
  toTxUnspentOutput,
  TransactionUnspentOutput,
  TransactionWitnessSet,
  VkeyWitness,
} from "@meshsdk/core-cst";

import { EmbeddedWallet } from "../embedded";
import { GetAddressType } from "../types";

export type AppWalletKeyType =
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

export type CreateAppWalletOptions = {
  networkId: number;
  fetcher?: IFetcher;
  submitter?: ISubmitter;
  key: AppWalletKeyType;
};

export class AppWallet implements ISigner, ISubmitter {
  private readonly _fetcher?: CachedFetcher;
  private readonly _submitter?: ISubmitter;
  private readonly _wallet: EmbeddedWallet;

  constructor(options: CreateAppWalletOptions) {
    // UTxO lookups share one short-lived cache with other users of the same fetcher
    this._fetcher = options.fetcher && CachedFetcher.wrap(options.fetcher);
    this._submitter = options.submitter;

    this._wallet = new EmbeddedWallet({
      networkId: options.networkId,
      key: options.key,
    });
  }

  /**
   * Initializes the wallet. This is a required call as fetching addresses from the wallet is an async operation.
   * @returns void
   */
  async init() {
    if (this._wallet) {
      await this._wallet.init();
    }
  }

  /**
   * Get a list of UTXOs to be used as collateral inputs for transactions with plutus script inputs.
   *
   * This is used in transaction building.
   *
   * @returns a list of UTXOs
   */
  async getCollateralUnspentOutput(
    accountIndex = 0,
    addressType: GetAddressType = "payment",
  ): Promise<TransactionUnspentOutput[]> {
    const utxos = await this.getUnspentOutputs(accountIndex, addressType);

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

  getEnterpriseAddress(accountIndex = 0, keyIndex = 0): string {
    const account = this._wallet.getAccount(accountIndex, keyIndex);
    return account.enterpriseAddressBech32;
  }

  getPaymentAddress(accountIndex = 0, keyIndex = 0): string {
    const account = this._wallet.getAccount(accountIndex, keyIndex);
    return account.baseAddressBech32;
  }

  getRewardAddress(accountIndex = 0, keyIndex = 0): string {
    const account = this._wallet.getAccount(accountIndex, keyIndex);
    return account.rewardAddressBech32;
  }

  getNetworkId(): number {
    return this._wallet.getNetworkId();
  }

  getUsedAddress(
    accountIndex = 0,
    keyIndex = 0,
    addressType: GetAddressType = "payment",
  ): Address {
    if (addressType === "enterprise") {
      return toAddress(this.getEnterpriseAddress(accountIndex, keyIndex));
    } else {
      return toAddress(this.getPaymentAddress(accountIndex, keyIndex));
    }
  }

  async getUnspentOutputs(
    accountIndex = 0,
    addressType: GetAddressType = "payment",
  ): Promise<TransactionUnspentOutput[]> {
    if (!this._fetcher) {
      throw new Error(
        "[AppWallet] Fetcher is required to fetch UTxOs. Please provide a fetcher.",
      );
    }
    const account = this._wallet.getAccount(accountIndex);

    const utxos = await this._fetcher.fetchAddressUTxOs(
      addressType == "enterprise"
        ? account.enterpriseAddressBech32
        : account.baseAddressBech32,
    );

    return utxos.map((utxo) => toTxUnspentOutput(utxo));
  }

  async signData(
    address: string,
    payload: string,
    accountIndex = 0,
    keyIndex = 0,
  ): Promise<DataSignature> {
    try {
      return this._wallet.signData(address, payload, accountIndex, keyIndex);
    } catch (error) {
      throw new Error(
        `[AppWallet] An error occurred during signData: ${error}.`,
      );
    }
  }

  async signTx(
    unsignedTx: string,
    partialSign = false,
    returnFullTx = true,
    accountIndex = 0,
    keyIndex = 0,
  ): Promise<string> {
    try {
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
        accountIndex,
        keyIndex,
      );

      if (!returnFullTx) {
        let witnessSet = new TransactionWitnessSet();
        witnessSet.setVkeys(
          Serialization.CborSet.fromCore(
            [newSignatures.toCore()],
            VkeyWitness.fromCore,
          ),
        );
        return witnessSet.toCbor();
      }

      let signedTx = EmbeddedWallet.addWitnessSets(unsignedTx, [newSignatures]);
      return signedTx;
    } catch (error) {
      throw new Error(`[AppWallet] An error occurred during signTx: ${error}.`);
    }
  }

  signTxSync(
    unsignedTx: string,
    partialSign = false,
    accountIndex = 0,
    keyIndex = 0,
  ): string {
    try {
      throw new Error(`[AppWallet] signTxSync() is not implemented.`);
    } catch (error) {
      throw new Error(`[AppWallet] An error occurred during signTx: ${error}.`);
    }
  }

  async signTxs(
    unsignedTxs: string[],
    partialSign: boolean,
  ): Promise<string[]> {
    throw new Error(`[AppWallet] signTxs() is not implemented.`);
  }

  async submitTx(tx: string): Promise<string> {
    if (!this._submitter) {
      throw new Error(
        "[AppWallet] Submitter is required to submit transactions. Please provide a submitter.",
      );
    }
    try {
      return await this._submitter.submitTx(tx);
    } finally {
      // The submitted tx changes this wallet's UTxOs; don't serve them from cache
      this._fetcher?.clearVolatile();
    }
  }

  static brew(strength = 256): string[] {
    return EmbeddedWallet.generateMnemonic(strength);
  }
}
