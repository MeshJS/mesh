import { IEvaluator, IFetcher } from "@meshsdk/common";

/**
 * Chain context every spend-action builder needs. Unlike `client/build.ts`'s `ChainContext`
 * (payment-building only ever creates outputs), spending FROM a Plutus script needs its
 * redeemer's execution units estimated, so it takes an `evaluator` explicitly rather than
 * leaving it to `MeshTxBuilder`'s default (local evaluation with Scalus). `BlockfrostProvider`
 * implements `IEvaluator` alongside `IFetcher`, so a live caller can pass the same provider
 * instance for both.
 */
export type SpendContext = {
  fetcher: IFetcher;
  evaluator: IEvaluator;
  currentSlot: number;
};
