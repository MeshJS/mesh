import { Asset } from "../types/assets";
import { Core } from "./core";
import { Blockfrost } from "../provider/blockfrost";
import { Transaction } from "./transaction";

export class Mesh {
  private _blockfrost: Blockfrost;
  private _core: Core; // serialize lib
  private _transaction: Transaction;
  // private _martify: Martify; // API calls

  constructor() {
    this._core = new Core();
  }

  //** CORE **//

  /**
   * Init Mesh library
   * @param blockfrostApiKey get your keys from blockfrost
   * @param network 0 for testnet, 1 for mainnet
   */
  async init({
    blockfrostApiKey,
    network,
  }: {
    blockfrostApiKey?: string;
    network?: number;
  }) {
    await this._core.init();

    if (blockfrostApiKey !== undefined && network !== undefined) {
      this._blockfrost = new Blockfrost({ blockfrostApiKey, network });
    }
  }

  /**
   * Enable and connect wallet
   * @param walletName available wallets are `ccvault`, `gerowallet` and `nami`
   * @returns wallet is connected boolean
   */
  async enableWallet({ walletName }: { walletName: string }) {
    let connected = await this._core.enableWallet({ walletName });
    this._transaction = new Transaction({
      blockfrost: this._blockfrost,
      core: this._core,
    });
    return connected;
  }

  /**
   * Returns a list of all used (included in some on-chain transaction) addresses controlled by the wallet.
   * @returns list of bech32 addresses
   */
  async getUsedAddresses() {
    return await this._core.getUsedAddresses();
  }

  /**
   * Returns the reward addresses owned by the wallet. This can return multiple addresses e.g. CIP-0018.
   * @returns list of reward addresses
   */
  async getRewardAddresses() {
    return await this._core.getRewardAddresses();
  }

  /**
   * Return the first used address
   * @returns first address in string
   */
  async getUsedAddress(): Promise<string> {
    const usedAddresses = await this.getUsedAddresses();
    return usedAddresses[0];
  }

  /**
   * Return the first reward address
   * @returns first address in string
   */
  async getRewardAddress(): Promise<string> {
    const addresses = await this.getRewardAddresses();
    return addresses[0];
  }

  /**
   * return a list of all UTXOs (unspent transaction outputs) controlled by the wallet
   * @returns list of all UTXOs
   */
  async getUtxos() {
    return await this._core.getUtxos();
  }

  /**
   * Get a list wallets installed on this browse
   * @returns a list of available wallets
   */
  async getAvailableWallets() {
    return await this._core.getAvailableWallets();
  }

  /**
   * Returns the network id of the currently connected account. 0 is testnet and 1 is mainnet but other networks can possibly be returned by wallets. Those other network ID values are not governed by this document.
   * @returns 0 is testnet and 1 is mainnet
   */
  async getNetworkId() {
    return await this._core.getNetworkId();
  }

  /**
   * Return lovelace amount
   * @returns {string}
   */
  async getLovelace() {
    return await this._core.getLovelace();
  }

  /**
   *
   * @param policyId (optional) if provided will filter only assets in this policy
   * @returns
   */
  async getAssets({ policyId }: { policyId?: string }): Promise<Asset[]> {
    const assets = await this._core.getAssets();
    if (policyId) {
      const filteredAssets = assets
        .filter(function (el) {
          return el.unit.includes(policyId);
        })
        .map((item) => {
          return item;
        });
      return filteredAssets;
    }
    return assets;
  }

  /**
   * This endpoint utilizes the CIP-0008 signing spec for standardization/safety reasons. It allows the dApp to request the user to sign a payload conforming to said spec.
   * @param payload
   * @returns signature
   */
  async signData({ payload }: { payload: string }) {
    const signature = await this._core.signData({ payload });
    return signature;
  }

  /**
   * Requests that a user sign the unsigned portions of the supplied transaction. The wallet should ask the user for permission, and if given, try to sign the supplied body and return a signed transaction.
   * @param tx CBOR string
   * @param partialSign boolean default false
   * @returns signature
   */
  async signTx({
    tx,
    partialSign = false,
  }: {
    tx: string;
    partialSign: boolean;
  }) {
    const signature = await this._core.signTx({ tx, partialSign });
    return signature;
  }

  /**
   * As wallets should already have this ability, we allow dApps to request that a transaction be sent through it. If the wallet accepts the transaction and tries to send it, it shall return the transaction id for the dApp to track.
   * @param tx CBOR string
   * @returns transactionHash
   */
  async submitTx({ tx }: { tx: string }) {
    const transactionHash = await this._core.submitTx({ tx });
    return transactionHash;
  }

  //** TRANSACTION **//

  /**
   *
   * @param param0
   * @returns
   */
  async makeSimpleTransaction({ lovelace = 0 }: { lovelace: number }) {
    const txCbor = await this._transaction.makeSimpleTransaction({
      lovelace,
    });
    return txCbor;
  }

  //** MARTIFY **//

  async callSomeApiDoSomething() {}
}
