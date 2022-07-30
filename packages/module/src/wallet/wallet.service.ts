import {
  csl, deserializeAddress, fromValue, toBytes
} from '../core';
import type { Asset } from '../core';

const { Value } = csl;

export class WalletService {
  private _walletInstance: WalletInstance;

  private constructor(walletInstance: WalletInstance) {
    this._walletInstance = walletInstance
  }

  static supportedWallets = [
    'flint', 'nami', 'eternl', 'nufi',
  ];

  static getAvailableWallets(): Partial<Wallet>[] {
    if (window.cardano === undefined) return [];
    
    return WalletService.supportedWallets
      .filter((sw) => window.cardano[sw] !== undefined)
      .map((sw) => ({
        name: window.cardano[sw].name,
        icon: window.cardano[sw].icon,
        version: window.cardano[sw].apiVersion,
      }));
  }

  static async create(walletName: string): Promise<WalletService> {
    const walletInstance = await WalletService.enable(walletName);
    if (walletInstance !== undefined) return new WalletService(walletInstance);
    throw new Error(`Couldn't create an instance for wallet: ${walletName}.`);
  }

  async getBalance(): Promise<Asset[]> {
    const balance = await this._walletInstance.getBalance();
    return fromValue(Value.from_bytes(toBytes(balance)));
  }

  async getChangeAddress(): Promise<string> {
    const changeAddress = await this._walletInstance.getChangeAddress();
    return deserializeAddress(changeAddress).to_bech32();
  }

  async getCollateral(): Promise<string[]> {
    const collateral = await this._walletInstance.experimental.getCollateral();
    return collateral ?? [];
  }

  async getNetworkId(): Promise<number> {
    return await this._walletInstance.getNetworkId();
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
    const changeAddress = await this.getChangeAddress();
    return await this._walletInstance.signData(changeAddress, payload);
  }

  async signTx(tx: string, partialSign = false): Promise<string> {
    return await this._walletInstance.signTx(tx, partialSign);
  }

  async submitTx(tx: string): Promise<string> {
    return await this._walletInstance.submitTx(tx);
  }

  private static async enable(selectedWalletName: string): Promise<WalletInstance | undefined> {
    if (window.cardano === undefined) return undefined;
  
    const wallet: Wallet | undefined = WalletService.supportedWallets
      .map((sw: string) => window.cardano[sw])
      .filter((sw: Wallet) => sw !== undefined)
      .find((sw: Wallet) => sw.name === selectedWalletName);

    return await wallet?.enable();
  }
}

type Wallet = {
  name: string;
  icon: string;
  version: string;
  enable(): Promise<WalletInstance>;
}

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
}

type ExperimentalFeatures = {
  getCollateral(): Promise<string[] | undefined>;
}

/**
 * <MESH>
 *  - getControlledStakeKey
 *  - getLovelaceBalance
 *  - getNativeAssets
 */
