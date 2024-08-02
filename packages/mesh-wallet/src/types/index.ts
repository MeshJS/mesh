import { DataSignature } from "@meshsdk/common";

export type Cardano = {
  [key: string]: {
    name: string;
    icon: string;
    apiVersion: string;
    enable: () => Promise<WalletInstance>;
  };
};

type TransactionSignatureRequest = {
  cbor: string;
  partialSign: boolean;
};

export type WalletInstance = {
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
  signTxs?(txs: TransactionSignatureRequest[]): Promise<string[]>; // Overloading interface as currently no standard
  signTxs?(txs: string[], partialSign: boolean): Promise<string[]>; // Overloading interface as currently no standard
  submitTx(tx: string): Promise<string>;
};

type ExperimentalFeatures = {
  getCollateral(): Promise<string[] | undefined>;
  signTxs?(txs: TransactionSignatureRequest[]): Promise<string[]>; // Overloading interface as currently no standard
  signTxs?(txs: string[], partialSign: boolean): Promise<string[]>; // Overloading interface as currently no standard
};

export type GetAddressType = "enterprise" | "payment";
