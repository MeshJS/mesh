import {
  MeshTxBuilder,
  IFetcher,
  UTxO,
  BrowserWallet,
  MeshWallet,
} from '@meshsdk/core';
import { v2ScriptToBech32 } from '@meshsdk/core-csl';

export type MeshTxInitiatorInput = {
  mesh: MeshTxBuilder;
  fetcher?: IFetcher;
  wallet?: BrowserWallet | MeshWallet;
  networkId?: number;
  stakeCredential?: string;
};

export class MeshTxInitiator {
  mesh: MeshTxBuilder;
  fetcher?: IFetcher;
  wallet?: BrowserWallet | MeshWallet;
  stakeCredential?: string;
  networkId = 0;

  constructor({
    mesh,
    fetcher,
    wallet,
    networkId,
    stakeCredential,
  }: MeshTxInitiatorInput) {
    this.mesh = mesh;
    if (fetcher) {
      this.fetcher = fetcher;
    }
    if (wallet) {
      this.wallet = wallet;
    }
    if (networkId) {
      this.networkId = networkId;
    }
    if (stakeCredential) {
      this.stakeCredential = this.stakeCredential;
    }
  }

  protected signSubmitReset = async () => {
    const signedTx = this.mesh.completeSigning();
    const txHash = await this.mesh.submitTx(signedTx);
    this.mesh.meshTxBuilderBody = this.mesh.emptyTxBuilderBody();
    return txHash;
  };

  protected queryUtxos = async (walletAddress: string): Promise<UTxO[]> => {
    if (this.fetcher) {
      const utxos = await this.fetcher.fetchAddressUTxOs(walletAddress);
      return utxos;
    }
    return [];
  };

  protected getWalletDappAddress = async () => {
    if (this.wallet) {
      const usedAddresses = await this.wallet.getUsedAddresses();
      if (usedAddresses.length > 0) {
        return usedAddresses[0];
      }
      const unusedAddresses = await this.wallet.getUnusedAddresses();
      if (unusedAddresses.length > 0) {
        return unusedAddresses[0];
      }
    }
    return '';
  };

  protected getWalletCollateral = async (): Promise<UTxO | undefined> => {
    if (this.wallet) {
      const utxos = await this.wallet.getCollateral();
      return utxos[0];
    }
    return undefined;
  };

  protected getWalletUtxosWithMinLovelace = async (
    lovelace: number,
    providedUtxos: UTxO[] = []
  ) => {
    let utxos: UTxO[] = providedUtxos;
    if (this.wallet && (!providedUtxos || providedUtxos.length === 0)) {
      utxos = await this.wallet.getUtxos();
    }
    return utxos.filter((u) => {
      const lovelaceAmount = u.output.amount.find(
        (a: any) => a.unit === 'lovelace'
      )?.quantity;
      return Number(lovelaceAmount) > lovelace;
    });
  };

  protected getWalletUtxosWithToken = async (
    assetHex: string,
    userUtxos: UTxO[] = []
  ) => {
    let utxos: UTxO[] = userUtxos;
    if (this.wallet && userUtxos.length === 0) {
      utxos = await this.wallet.getUtxos();
    }
    return utxos.filter((u) => {
      const assetAmount = u.output.amount.find(
        (a: any) => a.unit === assetHex
      )?.quantity;
      return Number(assetAmount) >= 1;
    });
  };

  protected getAddressUtxosWithMinLovelace = async (
    walletAddress: string,
    lovelace: number,
    providedUtxos: UTxO[] = []
  ) => {
    let utxos: UTxO[] = providedUtxos;
    if (this.fetcher && (!providedUtxos || providedUtxos.length === 0)) {
      utxos = await this.fetcher.fetchAddressUTxOs(walletAddress);
    }
    return utxos.filter((u) => {
      const lovelaceAmount = u.output.amount.find(
        (a: any) => a.unit === 'lovelace'
      )?.quantity;
      return Number(lovelaceAmount) > lovelace;
    });
  };

  protected getAddressUtxosWithToken = async (
    walletAddress: string,
    assetHex: string,
    userUtxos: UTxO[] = []
  ) => {
    let utxos: UTxO[] = userUtxos;
    if (this.fetcher && userUtxos.length === 0) {
      utxos = await this.fetcher.fetchAddressUTxOs(walletAddress);
    }
    return utxos.filter((u) => {
      const assetAmount = u.output.amount.find(
        (a: any) => a.unit === assetHex
      )?.quantity;
      return Number(assetAmount) >= 1;
    });
  };

  protected getWalletInfoForTx = async () => {
    const utxos = await this.wallet?.getUtxos();
    const collateral = await this.getWalletCollateral();
    const walletAddress = await this.getWalletDappAddress();
    if (!utxos || utxos?.length === 0) {
      throw new Error('No utxos found');
    }
    if (!collateral) {
      throw new Error('No collateral found');
    }
    if (!walletAddress) {
      throw new Error('No wallet address found');
    }
    return { utxos, collateral, walletAddress };
  };

  protected _getUtxoByTxHash = async (
    scriptCbor: string,
    txHash: string
  ): Promise<UTxO | undefined> => {
    if (this.fetcher) {
      const scriptAddr = v2ScriptToBech32(
        scriptCbor,
        undefined,
        this.networkId
      );

      const utxos = await this.fetcher.fetchAddressUTxOs(scriptAddr);
      return utxos.filter((utxo) => utxo.input.txHash === txHash)[0];
    }

    return undefined;
  };
}
