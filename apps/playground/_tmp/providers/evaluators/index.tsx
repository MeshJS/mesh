import {
  BlockfrostProvider,
  MaestroProvider,
  OgmiosProvider,
  U5CProvider,
  YaciProvider,
} from "@meshsdk/core";

import EvaluatorEvaluateTransaction from "./evaluate-tx";
import {OfflineEvaluator} from "@meshsdk/core-csl";

export default function ProviderEvaluators({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedEvaluators;
  provider: string;
}) {
  return (
    <>
      <EvaluatorEvaluateTransaction
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
    </>
  );
}

export type SupportedEvaluators =
  | BlockfrostProvider
  | YaciProvider
  | MaestroProvider
  | OgmiosProvider
  | U5CProvider
  | OfflineEvaluator;
