import {
  BlockfrostProvider,
  MaestroProvider,
  OgmiosProvider,
  U5CProvider,
  YaciProvider,
} from "@meshsdk/core";

import EvaluatorEvaluateTransaction from "./evaluate-tx";

export default function ProviderEvaluators({
  provider,
  providerName,
}: {
  provider?: SupportedEvaluators;
  providerName: string;
}) {
  return (
    <>
      <EvaluatorEvaluateTransaction
        provider={provider}
        providerName={providerName}
      />
    </>
  );
}

export type SupportedEvaluators =
  | BlockfrostProvider
  | YaciProvider
  | MaestroProvider
  | OgmiosProvider
  | U5CProvider;
