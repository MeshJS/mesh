import { csl } from '../core';
import {
  deserializeAddress, fromValue, toBytes
} from '../common/utils';
import type { Asset } from '../common/types';

export class WalletService {
  private _walletInstance: WalletInstance;

  private constructor(walletInstance: WalletInstance) {
    this._walletInstance = walletInstance;
  }

  static supportedWallets = ['flint', 'nami', 'eternl', 'nufi'];

  static getInstalledWallets(): Partial<Wallet>[] {
    if (window.cardano === undefined) return [];

    return WalletService.supportedWallets
      .filter((sw) => window.cardano[sw] !== undefined)
      .map((sw) => ({
        name: window.cardano[sw].name,
        icon: window.cardano[sw].icon,
        version: window.cardano[sw].apiVersion,
      }));
  }

  static async enable(walletName: string): Promise<WalletService> {
    const walletInstance = await WalletService.resolveInstance(walletName);

    if (walletInstance !== undefined)
      return new WalletService(walletInstance);

    throw new Error(`Couldn't create an instance for wallet: ${walletName}.`);
  }

  async getBalance(): Promise<Asset[]> {
    const balance = await this._walletInstance.getBalance();
    return fromValue(csl.Value.from_bytes(toBytes(balance)));
  }

  async getChangeAddress(): Promise<string> {
    const changeAddress = await this._walletInstance.getChangeAddress();
    return deserializeAddress(changeAddress).to_bech32();
  }

  async getCollateral(): Promise<string[]> {
    const collateral = await this._walletInstance.experimental.getCollateral();
    return collateral ?? [];
  }

  getNetworkId(): Promise<number> {
    return this._walletInstance.getNetworkId();
  }

  async getRewardAddresses(): Promise<string[]> {
    const rewardAddresses = await this._walletInstance.getRewardAddresses();
    return rewardAddresses.map((ra) => deserializeAddress(ra).to_bech32());
  }

  async getUnusedAddresses(): Promise<string[]> {
    const unusedAddresses = await this._walletInstance.getUnusedAddresses();
    return unusedAddresses.map((una) => deserializeAddress(una).to_bech32());
  }

  async getUsedAddresses(): Promise<string[]> {
    const usedAddresses = await this._walletInstance.getUsedAddresses();
    return usedAddresses.map((usa) => deserializeAddress(usa).to_bech32());
  }

  async getUtxos(): Promise<string[]> {
    const utxos = await this._walletInstance.getUtxos();
    return utxos ?? [];
  }

  async signData(payload: string): Promise<string> {
    const changeAddress = await this._walletInstance.getChangeAddress();
    return this._walletInstance.signData(changeAddress, payload);
  }

  signTx(tx: string, partialSign = false): Promise<string> {
    return this._walletInstance.signTx(tx, partialSign);
  }

  submitTx(tx: string): Promise<string> {
    return this._walletInstance.submitTx(tx);
  }

  async getNativeAssets(limit?: number): Promise<Asset[]> {
    const balance = await this.getBalance();
    const nativeAssets = balance.filter((v) => v.unit !== 'lovelace');

    return limit !== undefined
      ? nativeAssets.slice(0, limit)
      : nativeAssets;
  }

  async getNativeAssetsCollection(policyId: string): Promise<Asset[]> {
    const balance = await this.getBalance();
    return balance.filter((v) => v.unit.startsWith(policyId));
  }

  async getLovelaceBalance(): Promise<number> {
    const balance = await this.getBalance();
    const nativeAsset = balance.find((v) => v.unit === 'lovelace');

    return nativeAsset !== undefined
      ? parseInt(nativeAsset.quantity, 10)
      : 0;
  }

  private static resolveInstance(
    walletName: string
  ): Promise<WalletInstance> | undefined {
    if (window.cardano === undefined) return undefined;

    const wallet: Wallet | undefined = WalletService.supportedWallets
      .map((sw: string) => window.cardano[sw])
      .filter((sw: Wallet) => sw !== undefined)
      .find((sw: Wallet) => sw.name === walletName);

    return wallet?.enable();
  }
}

type Wallet = {
  name: string;
  icon: string;
  version: string;
  enable(): Promise<WalletInstance>;
};

type WalletInstance = {
  experimental: ExperimentalFeatures;
  getBalance(): Promise<string>;
  getChangeAddress(): Promise<string>;
  getNetworkId(): Promise<number>;
  getRewardAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getUsedAddresses(): Promise<string[]>;
  getUtxos(): Promise<string[] | undefined>;
  signData(address: string, payload: string): Promise<string>;
  signTx(tx: string, partialSign: boolean): Promise<string>;
  submitTx(tx: string): Promise<string>;
};

type ExperimentalFeatures = {
  getCollateral(): Promise<string[] | undefined>;
};
