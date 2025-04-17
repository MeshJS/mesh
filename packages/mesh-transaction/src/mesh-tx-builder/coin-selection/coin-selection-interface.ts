import {
  Action,
  Asset,
  Output,
  TxIn,
  TxOutput,
  UTxO,
} from '@meshsdk/common';

export interface TransactionPrototype {
  newInputs: Set<UTxO>;
  newOutputs: Set<TxOutput>;
  change: Array<TxOutput>;
  fee: bigint;
  redeemers?: Array<Omit<Action, 'data'>>;
}

export interface ImplicitValue {
  withdrawals: bigint;
  deposit: bigint;
  reclaimDeposit: bigint;
  mint: Asset[];
}

export interface TransactionCost {
  fee: bigint;
  redeemers?: Array<Omit<Action, 'data'>>;
}

export declare type EstimateTxCosts = (
  selectionSkeleton: TransactionPrototype,
) => Promise<TransactionCost>;
export declare type TokenBundleSizeExceedsLimit = (
  tokenBundle?: Asset[],
) => boolean;
export declare type ComputeMinimumCoinQuantity = (output: TxOutput) => bigint;
export declare type MaxSizeExceed = (
  selectionSkeleton: TransactionPrototype,
) => Promise<boolean>;

export interface BuilderCallbacks {
  computeMinimumCost: EstimateTxCosts;
  tokenBundleSizeExceedsLimit: TokenBundleSizeExceedsLimit;
  computeMinimumCoinQuantity: ComputeMinimumCoinQuantity;
  maxSizeExceed: MaxSizeExceed;
}

export interface IInputSelector {
  select: (
    preselectedUtoxs: TxIn[],
    outputs: Output[],
    implicitValue: ImplicitValue,
    utxos: UTxO[],
    changeAddress: string,
  ) => Promise<TransactionPrototype>;
}
