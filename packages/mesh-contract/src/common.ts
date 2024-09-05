import {
  BrowserWallet,
  IFetcher,
  LanguageVersion,
  MeshTxBuilder,
  MeshWallet,
  UTxO,
} from "@meshsdk/core";
import { v2ScriptToBech32 } from "@meshsdk/core-csl";

export type MeshTxInitiatorInput = {
  mesh: MeshTxBuilder;
  fetcher?: IFetcher;
  wallet?: BrowserWallet | MeshWallet;
  networkId?: number;
  stakeCredential?: string;
  version?: number;
};

export class MeshTxInitiator {
  mesh: MeshTxBuilder;
  fetcher?: IFetcher;
  wallet?: BrowserWallet | MeshWallet;
  stakeCredential?: string;
  networkId = 0;
  version = 2;
  languageVersion: LanguageVersion = "V2";

  constructor({
    mesh,
    fetcher,
    wallet,
    networkId = 0,
    stakeCredential,
    version = 2,
  }: MeshTxInitiatorInput) {
    this.mesh = mesh;
    if (fetcher) {
      this.fetcher = fetcher;
    }
    if (wallet) {
      this.wallet = wallet;
    }

    this.networkId = networkId;
    if (networkId === 1) {
      this.mesh.setNetwork("mainnet");
    } else {
      this.mesh.setNetwork("preprod");
    }

    if (stakeCredential) {
      this.stakeCredential = this.stakeCredential;
    }

    this.version = version;
    switch (this.version) {
      case 1:
        this.languageVersion = "V2";
        break;
      default:
        this.languageVersion = "V3";
    }
  }

  protected signSubmitReset = async () => {
    const signedTx = this.mesh.completeSigning();
    const txHash = await this.mesh.submitTx(signedTx);
    this.mesh.reset();
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
    return "";
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
    providedUtxos: UTxO[] = [],
  ) => {
    let utxos: UTxO[] = providedUtxos;
    if (this.wallet && (!providedUtxos || providedUtxos.length === 0)) {
      utxos = await this.wallet.getUtxos();
    }
    return utxos.filter((u) => {
      const lovelaceAmount = u.output.amount.find(
        (a: any) => a.unit === "lovelace",
      )?.quantity;
      return Number(lovelaceAmount) > lovelace;
    });
  };

  protected getWalletUtxosWithToken = async (
    assetHex: string,
    userUtxos: UTxO[] = [],
  ) => {
    let utxos: UTxO[] = userUtxos;
    if (this.wallet && userUtxos.length === 0) {
      utxos = await this.wallet.getUtxos();
    }
    return utxos.filter((u) => {
      const assetAmount = u.output.amount.find(
        (a: any) => a.unit === assetHex,
      )?.quantity;
      return Number(assetAmount) >= 1;
    });
  };

  protected getAddressUtxosWithMinLovelace = async (
    walletAddress: string,
    lovelace: number,
    providedUtxos: UTxO[] = [],
  ) => {
    let utxos: UTxO[] = providedUtxos;
    if (this.fetcher && (!providedUtxos || providedUtxos.length === 0)) {
      utxos = await this.fetcher.fetchAddressUTxOs(walletAddress);
    }
    return utxos.filter((u) => {
      const lovelaceAmount = u.output.amount.find(
        (a: any) => a.unit === "lovelace",
      )?.quantity;
      return Number(lovelaceAmount) > lovelace;
    });
  };

  protected getAddressUtxosWithToken = async (
    walletAddress: string,
    assetHex: string,
    userUtxos: UTxO[] = [],
  ) => {
    let utxos: UTxO[] = userUtxos;
    if (this.fetcher && userUtxos.length === 0) {
      utxos = await this.fetcher.fetchAddressUTxOs(walletAddress);
    }
    return utxos.filter((u) => {
      const assetAmount = u.output.amount.find(
        (a: any) => a.unit === assetHex,
      )?.quantity;
      return Number(assetAmount) >= 1;
    });
  };

  protected getWalletInfoForTx = async () => {
    const utxos = await this.wallet?.getUtxos();
    const collateral = await this.getWalletCollateral();
    const walletAddress = await this.getWalletDappAddress();
    if (!utxos || utxos?.length === 0) {
      throw new Error("No utxos found");
    }
    if (!collateral) {
      throw new Error("No collateral found");
    }
    if (!walletAddress) {
      throw new Error("No wallet address found");
    }
    return { utxos, collateral, walletAddress };
  };

  protected _getUtxoByTxHash = async (
    txHash: string,
    scriptCbor?: string,
  ): Promise<UTxO | undefined> => {
    if (this.fetcher) {
      const utxos = await this.fetcher?.fetchUTxOs(txHash);
      let scriptUtxo = utxos[0];

      if (scriptCbor) {
        const scriptAddr = v2ScriptToBech32(
          scriptCbor,
          undefined,
          this.networkId,
        );
        scriptUtxo =
          utxos.filter((utxo) => utxo.output.address === scriptAddr)[0] ||
          utxos[0];
      }

      return scriptUtxo;
    }

    return undefined;
  };
}
