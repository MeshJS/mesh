import { DataSignature } from "@meshsdk/common";
import { Ed25519PublicKeyHex } from "@meshsdk/core-cst";

export type Cardano = {
  [key: string]: {
    name: string;
    icon: string;
    apiVersion: string;
    enable: (extensions?: {
      extensions: { cip: number }[];
    }) => Promise<WalletInstance>;
    supportedExtensions?: { cip: number }[];
  };
};

type TransactionSignatureRequest = {
  cbor: string;
  partialSign: boolean;
};

export interface Cip30WalletApi {
  experimental: ExperimentalFeatures;
  getBalance(): Promise<string>;
  getChangeAddress(): Promise<string>;
  getExtensions(): Promise<{ cip: number }[]>;
  getCollateral(): Promise<string[] | undefined>;
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
  cip95?: Cip95WalletApi;
}

export interface Cip95WalletApi {
  getRegisteredPubStakeKeys: () => Promise<Ed25519PublicKeyHex[]>;
  getUnregisteredPubStakeKeys: () => Promise<Ed25519PublicKeyHex[]>;
  getPubDRepKey: () => Promise<Ed25519PublicKeyHex>;
  signData(address: string, payload: string): Promise<DataSignature>;
}

export type WalletInstance = Cip30WalletApi & Cip95WalletApi;

type ExperimentalFeatures = {
  getCollateral(): Promise<string[] | undefined>;
  signTxs?(txs: TransactionSignatureRequest[]): Promise<string[]>; // Overloading interface as currently no standard
  signTxs?(txs: string[], partialSign: boolean): Promise<string[]>; // Overloading interface as currently no standard
};

export type GetAddressType = "enterprise" | "payment";
