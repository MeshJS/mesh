import {
  IFetcher,
  // IInitiator,
  // ISigner,
  ISubmitter,
} from '@mesh/common/contracts';
import { AppWallet } from './app.service';
import type { Address } from '@mesh/core';
import type { Asset, DataSignature, UTxO } from '@mesh/common/types';
import { fromTxUnspentOutput } from '@mesh/common/utils';

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

export class MeshWallet {
  // private readonly _fetcher: IFetcher;
  // private readonly _submitter: ISubmitter;
  private readonly _wallet: AppWallet;
  private readonly _network: number;

  constructor(options: CreateMeshWalletOptions) {
    // this._fetcher = options.fetcher;
    // this._submitter = options.submitter;
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

  getUnusedAddresses(): string[] {
    return [this.getChangeAddress()];
  }

  getUsedAddresses(): string[] {
    return [this.getChangeAddress()];
  }

  async getUtxos(): Promise<UTxO[]> {
    const utxos = await this._wallet.getUtxos();
    return utxos.map((c) => fromTxUnspentOutput(c));
  }

  signData(address: string, payload: string): DataSignature {
    return this._wallet.signData(address, payload);
  }

  async signTx(unsignedTx: string, partialSign = false): Promise<string> {
    return await this._wallet.signTx(unsignedTx, partialSign);
  }

  async submitTx(tx: string): Promise<string> {
    return await this._wallet.submitTx(tx);
  }

  getUsedAddress(): Address {
    return this._wallet.getUsedAddress();
  }

  // async getUsedCollateral(
  //   limit = DEFAULT_PROTOCOL_PARAMETERS.maxCollateralInputs
  // ): Promise<TransactionUnspentOutput[]> {

  // }
}
