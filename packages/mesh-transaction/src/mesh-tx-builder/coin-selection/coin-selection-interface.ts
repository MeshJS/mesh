import {Asset, Output, TxIn, TxOutput, UTxO} from "@meshsdk/common";

export interface TransactionPrototype {
    new_inputs: Set<UTxO>;
    new_outputs: Set<TxOutput>;
    change: Array<TxOutput>;
    fee: bigint;
}

export interface ImplicitValue {
    withdrawals: bigint
    deposit: bigint
    reclaimDeposit: bigint
    mint: Asset[]
}

export declare type EstimateTxCosts = (selectionSkeleton: TransactionPrototype) => Promise<bigint>;
export declare type TokenBundleSizeExceedsLimit = (tokenBundle?: Asset[]) => boolean;
export declare type ComputeMinimumCoinQuantity = (output: TxOutput) => bigint;
export declare type ComputeSelectionLimit = (selectionSkeleton: TransactionPrototype) => Promise<number>;

export interface BuilderCallbacks {
    computeMinimumCost: EstimateTxCosts;
    tokenBundleSizeExceedsLimit: TokenBundleSizeExceedsLimit;
    computeMinimumCoinQuantity: ComputeMinimumCoinQuantity;
    computeSelectionLimit: ComputeSelectionLimit;
}

export interface IInputSelector {
    select: (preselectedUtoxs: TxIn[], outputs: Output[], implicitValue: ImplicitValue, utxos: UTxO[], changeAddress: string) => Promise<TransactionPrototype>;
}
