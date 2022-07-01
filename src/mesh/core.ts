import SerializationLib from "../provider/serializationlib";
import { fromHex } from "../utils/converter";
import { WalletApi } from "../types";

export class Core {
  private _provider: WalletApi; // wallet provider on the browser, i.e. window.cardano.ccvault
  private _cardano; // Serialization Lib

  constructor() {}

  async init() {
    await SerializationLib.load();
    this._cardano = await SerializationLib.Instance;
  }

  _checkWallet() {
    if (this._provider == null) {
      throw "Wallet not connected.";
    }
  }

  fromCborToHex({ cbor }: { cbor: string }) {
    return this._cardano.Value.from_bytes(fromHex(cbor));
  }

  getCardano() {
    return this._cardano;
  }

  getWalletProvider() {
    return this._provider;
  }

  /**
   * Enable and connect wallet
   * @param walletName available wallets are `ccvault`, `gerowallet` and `nami`
   * @returns boolean
   */
  async enableWallet({ walletName }: { walletName: string }): Promise<boolean> {
    if (walletName === "ccvault") {
      const instance = await window.cardano?.ccvault?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (walletName === "gerowallet") {
      const instance = await window.cardano?.gerowallet?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (walletName === "nami" || walletName === null) {
      const instance = await window.cardano?.nami?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
      // this is old nami (`window.cardano`)
      // this._provider = window.cardano;
      // if (this._provider) {
      //   return true;
      // }
    }
    return false;
  }

  /**
   * Returns a list of all used (included in some on-chain transaction) addresses controlled by the wallet.
   * @returns list of bech32 addresses
   */
  async getUsedAddresses(): Promise<string[]> {
    this._checkWallet();
    const usedAddresses = await this._provider.getUsedAddresses();
    return usedAddresses.map((address) =>
      this._cardano.Address.from_bytes(fromHex(address)).to_bech32()
    );
  }

  async getUtxos(): Promise<string[] | undefined> {
    this._checkWallet();
    return await this._provider.getUtxos();
  }
}
