import { csl } from '@mesh/core';
import {
  DEFAULT_PROTOCOL_PARAMETERS, POLICY_ID_LENGTH, SUPPORTED_WALLETS,
} from '@mesh/common/constants';
import { IInitiator, ISigner, ISubmitter } from '@mesh/common/contracts';
import { mergeSignatures } from '@mesh/common/helpers';
import {
  deserializeAddress, deserializeTx, deserializeTxWitnessSet,
  deserializeTxUnspentOutput, deserializeValue, fromBytes,
  fromTxUnspentOutput, fromUTF8, fromValue, resolveFingerprint,
  toAddress, toUTF8,
} from '@mesh/common/utils';
import type { Address, TransactionUnspentOutput } from '@mesh/core';
import type {
  Asset, AssetExtended, DataSignature, UTxO, Wallet,
} from '@mesh/common/types';

export class BrowserWallet implements IInitiator, ISigner, ISubmitter {
  private constructor(private readonly _walletInstance: WalletInstance) {}

  static getInstalledWallets(): Wallet[] {
    if (window.cardano === undefined) return [];

    return SUPPORTED_WALLETS
      .filter((sw) => window.cardano[sw] !== undefined)
      .map((sw) => ({
        name: window.cardano[sw].name,
        icon: window.cardano[sw].icon,
        version: window.cardano[sw].apiVersion,
      }));
  }

  static async enable(walletName: string): Promise<BrowserWallet> {    
    try {
      const walletInstance = await BrowserWallet.resolveInstance(walletName);

      if (walletInstance !== undefined)
        return new BrowserWallet(walletInstance);

      throw new Error(`Couldn't create an instance of wallet: ${walletName}`);
    } catch (error) {
      throw new Error(`[BrowserWallet] An error occurred during enable: ${error}.`);
    }
  }

  async getBalance(): Promise<Asset[]> {
    const balance = await this._walletInstance.getBalance();
    return fromValue(deserializeValue(balance));
  }

  async getChangeAddress(): Promise<string> {
    const changeAddress = await this._walletInstance.getChangeAddress();
    return deserializeAddress(changeAddress).to_bech32();
  }

  async getCollateral(
    limit = DEFAULT_PROTOCOL_PARAMETERS.maxCollateralInputs,
  ): Promise<UTxO[]> {
    const deserializedCollateral = await this.getUsedCollateral(limit);
    return deserializedCollateral.map((dc) => fromTxUnspentOutput(dc));
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

  async getUtxos(): Promise<UTxO[]> {
    const deserializedUTxOs = await this.getUsedUTxOs();
    return deserializedUTxOs.map((du) => fromTxUnspentOutput(du));
  }

  signData(address: string, payload: string): Promise<DataSignature> {
    const signerAddress = toAddress(address).to_hex();
    return this._walletInstance.signData(signerAddress, fromUTF8(payload));
  }

  async signTx(unsignedTx: string, partialSign = false): Promise<string> {
    try {
      const tx = deserializeTx(unsignedTx);
      const txWitnessSet = tx.witness_set();

      const newWitnessSet = await this._walletInstance
        .signTx(unsignedTx, partialSign);

      const newSignatures = deserializeTxWitnessSet(newWitnessSet)
        .vkeys() ?? csl.Vkeywitnesses.new();

      const txSignatures = mergeSignatures(
        txWitnessSet,
        newSignatures,
      );

      txWitnessSet.set_vkeys(txSignatures);

      const signedTx = fromBytes(
        csl.Transaction.new(
          tx.body(),
          txWitnessSet,
          tx.auxiliary_data()
        ).to_bytes()
      );

      return signedTx;
    } catch (error) {
      throw new Error(`[BrowserWallet] An error occurred during signTx: ${error}.`);
    }
  }

  submitTx(tx: string): Promise<string> {
    return this._walletInstance.submitTx(tx);
  }

  async getUsedAddress(): Promise<Address> {
    const usedAddresses = await this._walletInstance.getUsedAddresses();
    return deserializeAddress(usedAddresses[0]);
  }

  async getUsedCollateral(
    limit = DEFAULT_PROTOCOL_PARAMETERS.maxCollateralInputs,
  ): Promise<TransactionUnspentOutput[]> {
    const collateral = (await this._walletInstance.experimental.getCollateral()) ?? [];
    return collateral.map((c) => deserializeTxUnspentOutput(c)).slice(0, limit);
  }

  async getUsedUTxOs(): Promise<TransactionUnspentOutput[]> {
    const utxos = (await this._walletInstance.getUtxos()) ?? [];
    return utxos.map((u) => deserializeTxUnspentOutput(u));
  }

  async getAssets(): Promise<AssetExtended[]> {
    const balance = await this.getBalance();
    return balance
      .filter((v) => v.unit !== 'lovelace')
      .map((v) => {
        const policyId = v.unit.slice(0, POLICY_ID_LENGTH);
        const assetName = v.unit.slice(POLICY_ID_LENGTH);
        const fingerprint = resolveFingerprint(policyId, assetName);

        return {
          unit: v.unit,
          policyId,
          assetName: toUTF8(assetName),
          fingerprint,
          quantity: v.quantity
        };
      });
  }

  async getLovelace(): Promise<string> {
    const balance = await this.getBalance();
    const nativeAsset = balance.find((v) => v.unit === 'lovelace');

    return nativeAsset !== undefined ? nativeAsset.quantity : '0';
  }

  async getPolicyIdAssets(policyId: string): Promise<AssetExtended[]> {
    const assets = await this.getAssets();
    return assets.filter((v) => v.policyId === policyId);
  }

  async getPolicyIds(): Promise<string[]> {
    const balance = await this.getBalance();
    return Array.from(
      new Set(balance.map((v) => v.unit.slice(0, POLICY_ID_LENGTH))),
    ).filter((p) => p !== 'lovelace');
  }

  private static resolveInstance(walletName: string) {
    if (window.cardano === undefined)
      return undefined;

    const wallet = SUPPORTED_WALLETS
      .map((sw) => window.cardano[sw])
      .filter((sw) => sw !== undefined)
      .find((sw) => sw.name.toLowerCase() === walletName.toLowerCase());

    return wallet?.enable();
  }
}

declare global {
  interface Window {
    cardano: Cardano;
  }
}

type Cardano = {
  [key: string]: {
    name: string;
    icon: string;
    apiVersion: string;
    enable: () => Promise<WalletInstance>;
  };
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
  signData(address: string, payload: string): Promise<DataSignature>;
  signTx(tx: string, partialSign: boolean): Promise<string>;
  submitTx(tx: string): Promise<string>;
};

type ExperimentalFeatures = {
  getCollateral(): Promise<string[] | undefined>;
};
