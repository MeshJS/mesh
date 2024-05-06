import {
  IFetcher,
  IInitiator,
  ISigner,
  ISubmitter,
} from '@mesh/common/contracts';
import { AppWallet } from './app.service';
import type { Address, TransactionUnspentOutput } from '@mesh/core';
import type {
  Asset,
  AssetExtended,
  DataSignature,
  UTxO,
} from '@mesh/common/types';
import {
  fromTxUnspentOutput,
  toUTF8,
  resolveFingerprint,
} from '@mesh/common/utils';
import { POLICY_ID_LENGTH } from '@mesh/common/constants';

export type CreateMeshWalletOptions = {
  networkId: number;
  fetcher: IFetcher;
  submitter: ISubmitter;
  key:
    | {
        type: 'root';
        bech32: string;
      }
    | {
        type: 'cli';
        payment: string;
        stake?: string;
      }
    | {
        type: 'mnemonic';
        words: string[];
      };
};

export class MeshWallet implements IInitiator, ISigner, ISubmitter {
  private readonly _wallet: AppWallet;
  private readonly _network: number;

  constructor(options: CreateMeshWalletOptions) {
    this._network = options.networkId;

    switch (options.key.type) {
      case 'root':
        this._wallet = new AppWallet({
          networkId: options.networkId,
          fetcher: options.fetcher,
          submitter: options.submitter,
          key: {
            type: 'root',
            bech32: options.key.bech32,
          },
        });
        break;
      case 'cli':
        this._wallet = new AppWallet({
          networkId: options.networkId,
          fetcher: options.fetcher,
          submitter: options.submitter,
          key: {
            type: 'cli',
            payment: options.key.payment,
          },
        });
        break;
      case 'mnemonic':
        this._wallet = new AppWallet({
          networkId: options.networkId,
          fetcher: options.fetcher,
          submitter: options.submitter,
          key: {
            type: 'mnemonic',
            words: options.key.words,
          },
        });
        break;
    }
  }

  async getBalance(): Promise<Asset[]> {
    const utxos = await this.getUtxos();

    const assets = new Map<string, number>();
    utxos.map((utxo) => {
      utxo.output.amount.map((asset) => {
        const assetId = asset.unit;
        const amount = Number(asset.quantity);
        if (assets.has(assetId)) {
          const quantity = assets.get(assetId)!;
          assets.set(assetId, quantity + amount);
        } else {
          assets.set(assetId, amount);
        }
      });
    });

    const arrayAssets: Asset[] = Array.from(assets, ([unit, quantity]) => ({
      unit,
      quantity: quantity.toString(),
    }));

    return arrayAssets;
  }

  getChangeAddress(): string {
    return this._wallet.getPaymentAddress();
  }

  // todo hinson: how to deal with collateral?
  // async getCollateral(
  //   limit = DEFAULT_PROTOCOL_PARAMETERS.maxCollateralInputs
  // ): Promise<UTxO[]> {
  // }

  getNetworkId(): number {
    return this._network;
  }

  async getRewardAddresses(): Promise<string[]> {
    return [await this._wallet.getRewardAddress()];
  }

  // todo hinson: shall we do this? used and unused addresses are the same same change address?
  getUnusedAddresses(): string[] {
    return [this.getChangeAddress()];
  }

  // todo hinson: shall we do this? used and unused addresses are the same same change address?
  getUsedAddresses(): string[] {
    return [this.getChangeAddress()];
  }

  async getUtxos(): Promise<UTxO[]> {
    const utxos = await this.getUsedUTxOs();
    return utxos.map((c) => fromTxUnspentOutput(c));
  }

  signData(address: string, payload: string): DataSignature {
    return this._wallet.signData(address, payload);
  }

  async signTx(unsignedTx: string, partialSign = false): Promise<string> {
    return await this._wallet.signTx(unsignedTx, partialSign);
  }

  /**
   * Experimental feature - sign multiple transactions at once
   * @param unsignedTxs - array of unsigned transactions in CborHex string
   * @param partialSign - if the transactions are signed partially
   * @returns array of signed transactions CborHex string
   */
  async signTxs(unsignedTxs: string[], partialSign = false): Promise<string[]> {
    const signedTxs: string[] = [];

    for (const unsignedTx of unsignedTxs) {
      const signedTx = await this.signTx(unsignedTx, partialSign);
      signedTxs.push(signedTx);
    }

    return signedTxs;
  }

  async submitTx(tx: string): Promise<string> {
    return await this._wallet.submitTx(tx);
  }

  getUsedAddress(): Address {
    return this._wallet.getUsedAddress();
  }

  async getUsedCollateral(): Promise<TransactionUnspentOutput[]> {
    // hinson todo
    return [];
  }

  async getUsedUTxOs(): Promise<TransactionUnspentOutput[]> {
    return await this._wallet.getUtxos();
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
          quantity: v.quantity,
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
      new Set(balance.map((v) => v.unit.slice(0, POLICY_ID_LENGTH)))
    ).filter((p) => p !== 'lovelace');
  }
}
