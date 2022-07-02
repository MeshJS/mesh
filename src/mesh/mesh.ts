import { Asset } from "../types/assets";
import { Core } from "./core";

export class Mesh {
  private _core: Core; // serialize lib
  // TX; // build and sign txn
  // Martify; // API calls

  constructor() {
    this._core = new Core();
  }

  //** CORE **//

  /**
   * Init Mesh library
   * @param network 0 for testnet, 1 for mainnet
   * @param blockfrostApiKey get your keys from blockfrost
   */
  async init({
    network,
    blockfrostApiKey,
    martifyApiKey,
  }: {
    network: number;
    blockfrostApiKey?: string;
    martifyApiKey?: string;
  }) {
    await this._core.init();
  }

  /**
   * Enable and connect wallet
   * @param walletName available wallets are `ccvault`, `gerowallet` and `nami`
   * @returns boolean
   */
  async enableWallet({ walletName }: { walletName: string }) {
    let connected = await this._core.enableWallet({ walletName });
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

  async getAvailableWallets() {
    return await this._core.getAvailableWallets();
  }

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

  async signData({ payload }: { payload: string }) {
    const coseSign1Hex = await this._core.signData(payload);
    return coseSign1Hex;
  }

  //** TX **//

  async signTx() {}

  //** MARTIFY **//

  async callSomeApiDoSomething() {}
}
