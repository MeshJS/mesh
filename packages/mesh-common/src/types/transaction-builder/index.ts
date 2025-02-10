import { UtxoSelectionStrategy } from "../../utxo-selection";
import { Network } from "../network";
import { UTxO } from "../utxo";
import { Certificate } from "./certificate";
import { MintItem } from "./mint";
import { Output } from "./output";
import { PubKeyTxIn, RefTxIn, TxIn } from "./txin";
import { Vote } from "./vote";
import { Withdrawal } from "./withdrawal";

export * from "./data";
export * from "./mint";
export * from "./output";
export * from "./script";
export * from "./txin";
export * from "./withdrawal";
export * from "./certificate";
export * from "./vote";

export type MeshTxBuilderBody = {
  inputs: TxIn[];
  outputs: Output[];
  collaterals: PubKeyTxIn[];
  requiredSignatures: string[];
  referenceInputs: RefTxIn[];
  mints: MintItem[];
  changeAddress: string;
  metadata: TxMetadata;
  validityRange: ValidityRange;
  certificates: Certificate[];
  withdrawals: Withdrawal[];
  votes: Vote[];
  signingKey: string[];
  extraInputs: UTxO[];
  selectionConfig: {
    threshold: string;
    strategy: UtxoSelectionStrategy;
    includeTxFees: boolean;
  };
  chainedTxs: string[];
  inputsForEvaluation: Record<string, UTxO>;
  fee?: string;
  network: Network | number[][];
};

export const emptyTxBuilderBody = (): MeshTxBuilderBody => ({
  inputs: [],
  outputs: [],
  extraInputs: [],
  collaterals: [],
  requiredSignatures: [],
  referenceInputs: [],
  mints: [],
  changeAddress: "",
  metadata: new Map<bigint, Metadatum>(),
  validityRange: {},
  certificates: [],
  withdrawals: [],
  votes: [],
  signingKey: [],
  selectionConfig: {
    threshold: "0",
    strategy: "experimental",
    includeTxFees: true,
  },
  chainedTxs: [],
  inputsForEvaluation: {},
  network: "mainnet",
});

// Here

export type ValidityRange = {
  invalidBefore?: number;
  invalidHereafter?: number;
};

// Mint Types

// Transaction Metadata

export type MetadatumMap = Map<Metadatum, Metadatum>;
export type Metadatum =
  | bigint
  | number
  | string
  | Uint8Array
  | MetadatumMap
  | Metadatum[];
export type TxMetadata = Map<bigint, Metadatum>;

// to be used for serialization
export type Metadata = {
  tag: string;
  metadata: string;
};

// Utilities

export type RequiredWith<T, K extends keyof T> = Required<T> & {
  [P in K]: Required<T[P]>;
};

export const validityRangeToObj = (validityRange: ValidityRange): object => {
  return {
    invalidBefore: validityRange.invalidBefore ?? null,
    invalidHereafter: validityRange.invalidHereafter ?? null,
  };
};
