import { IEvaluator, IFetcher } from "@meshsdk/common";

/**
 * Chain context every spend-action builder needs. Unlike `client/build.ts`'s `ChainContext`
 * (payment-building only ever creates outputs), spending FROM a Plutus script needs an
 * `evaluator` too - without one, `MeshTxBuilder` falls back to Mesh's `DEFAULT_REDEEMER_BUDGET`
 * instead of estimating real execution units, which risks an under-budgeted (and therefore
 * failing) transaction. `BlockfrostProvider` implements `IEvaluator` alongside `IFetcher`, so a
 * live caller can pass the same provider instance for both.
 */
export type SpendContext = {
  fetcher: IFetcher;
  evaluator: IEvaluator;
  currentSlot: number;
};
