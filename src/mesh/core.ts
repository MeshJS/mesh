import SerializationLib from "../provider/serializationlib";
import { HexToAscii, toHex, fromHex } from "../utils/converter";
import { WalletApi } from "../types";
import { Asset } from "../types/assets";

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
   * @returns connected boolean
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

  async getRewardAddresses(): Promise<string[]> {
    return await this._provider.getRewardAddresses();
  }

  async getUtxos(): Promise<string[] | undefined> {
    this._checkWallet();
    return await this._provider.getUtxos();
  }

  /**
   *
   * @returns a list of available wallets
   */
  async getAvailableWallets(): Promise<string[]> {
    let availableWallets: string[] = [];

    if (window.cardano === undefined) {
      return availableWallets;
    }

    if (window.cardano.ccvault) {
      availableWallets.push("ccvault");
    }

    if (window.cardano.gerowallet) {
      availableWallets.push("gerowallet");
    }

    if (window.cardano.nami) {
      availableWallets.push("nami");
    }

    return availableWallets;
  }

  async getAssets(): Promise<Asset[]> {
    const valueCBOR = await this._provider.getBalance();
    const value = this._cardano.Value.from_bytes(fromHex(valueCBOR));

    const assets: Asset[] = [];
    if (value.multiasset()) {
      const multiAssets = value.multiasset().keys();
      for (let j = 0; j < multiAssets.len(); j++) {
        const policy = multiAssets.get(j);
        const policyAssets = value.multiasset().get(policy);
        const assetNames = policyAssets.keys();
        for (let k = 0; k < assetNames.len(); k++) {
          const policyAsset = assetNames.get(k);
          const quantity = policyAssets.get(policyAsset);
          const asset = toHex(policy.to_bytes()) + toHex(policyAsset.name());
          const _policy = asset.slice(0, 56);
          const _name = asset.slice(56);
          assets.push({
            unit: asset,
            quantity: quantity.to_str(),
            policy: _policy,
            name: HexToAscii(_name),
          });
        }
      }
    }

    return assets;
  }

  async signData(payload: string): Promise<string> {
    const rewardAddress = await this.getRewardAddresses();
    const coseSign1Hex = await this._provider.signData(
      rewardAddress[0],
      payload
    );
    return coseSign1Hex;
  }
}
