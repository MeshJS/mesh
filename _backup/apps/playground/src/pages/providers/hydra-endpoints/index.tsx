import { HydraProvider } from "@meshsdk/hydra";

import FetcherAddressUtxos from "../fetchers/fetch-address-utxos";
import FetcherProtocolParameters from "../fetchers/fetch-protocol-parameters";
import FetcherUtxos from "../fetchers/fetch-utxos";
import SubmitterSubmitTransaction from "../submitters/submit-transaction";
import HydraAbort from "./abort";
import HydraClose from "./close";
import HydraCommit from "./commit";
import HydraConnect from "./connect";
import HydraContest from "./contest";
import HydraDecommit from "./decommit";
import HydraFanout from "./fanout";
import HydraInitializeHead from "./init-head";
import HydraNewTx from "./new-tx";
import HydraOnMessage from "./on-message";

export default function ProviderHydra({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <>
      <HydraConnect provider={provider} providerName={providerName} />
      <HydraInitializeHead provider={provider} providerName={providerName} />
      <HydraCommit provider={provider} providerName={providerName} />
      <HydraAbort provider={provider} providerName={providerName} />
      <HydraNewTx provider={provider} providerName={providerName} />
      <HydraDecommit provider={provider} providerName={providerName} />
      <HydraClose provider={provider} providerName={providerName} />
      <HydraContest provider={provider} providerName={providerName} />
      <HydraFanout provider={provider} providerName={providerName} />

      <HydraOnMessage provider={provider} providerName={providerName} />

      <FetcherAddressUtxos provider={provider} providerName={providerName} />
      <FetcherProtocolParameters
        provider={provider}
        providerName={providerName}
      />
      <FetcherUtxos provider={provider} providerName={providerName} />
      <SubmitterSubmitTransaction
        provider={provider}
        providerName={providerName}
      />
    </>
  );
}
