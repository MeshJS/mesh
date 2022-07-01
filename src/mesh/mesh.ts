import { Asset } from "../types/assets";
import { Core } from "./core";
import { Wallet } from "./wallet";

export class Mesh {
  private _core: Core;
  private _wallet: Wallet;

  constructor() {
    this._core = new Core();
    this._wallet = new Wallet();
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
    blockfrostApiKey: string;
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
    if (connected) {
      this._wallet = new Wallet(
        this._core.getWalletProvider(),
        this._core.getCardano()
      );
    }
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
   * return a list of all UTXOs (unspent transaction outputs) controlled by the wallet
   * @returns list of all UTXOs
   */
  async getUtxos() {
    return await this._core.getUtxos();
  }

  //** WALLET **//

  async getAvailableWallets() {
    return await this._wallet.getAvailableWallets();
  }

  async getAssets({ policyId }: { policyId?: string }): Promise<Asset[]> {
    const assets = await this._wallet.getAssets();
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

  //** TX **//

  async signTx() {}

  async signData() {}

  //** MARTIFY **//

  async callSomeApiDoSomething() {}
}
