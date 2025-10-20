import { IBitcoinProvider } from "../interfaces/provider";

export type NetworkType = "Mainnet" | "Regtest" | "Testnet";

export type CreateWalletOptions = {
  network: NetworkType;
  key:
    | {
        type: "mnemonic";
        words: string[];
      }
    | {
        type: "address";
        address: string;
      };
  path?: string;
  provider?: IBitcoinProvider;
};

export type GetAddressResult = {
  address: string;
  publicKey: string;
  purpose: "payment" | "ordinals";
  addressType: "p2tr" | "p2wpkh" | "p2sh";
  network: "mainnet" | "testnet" | "regtest";
  walletType: "software" | "ledger";
};

export type SignMessageParams = {
  address: string;
  message: string;
  protocol?: "ECDSA" | "BIP322";
};

export type SignMessageResult = {
  signature: string;
  messageHash: string;
  address: string;
};

export type SignPsbtParams = {
  psbt: string;
  signInputs: Record<string, number[]>;
  broadcast?: boolean;
};

export type SignPsbtResult = {
  psbt: string;
  txid?: string;
};

export type SendTransferParams = {
  recipients: Array<{
    address: string;
    amount: number;
  }>;
};

export type SendTransferResult = {
  txid: string;
};

export type GetBalanceResult = {
  confirmed: string;
  unconfirmed: string;
  total: string;
};

export type SignMultipleTransactionsParams = {
  network: { type: NetworkType };
  message: string;
  psbts: Array<{
    psbtBase64: string;
    inputsToSign: Array<{
      address: string;
      signingIndexes: number[];
      sigHash?: number;
    }>;
  }>;
};

// Keep legacy type for backward compatibility
export type TransactionPayload = {
  inputs: {
    txid: string;
    vout: number;
    value: number;
  }[];
  outputs: {
    address: string;
    value: number;
  }[];
};