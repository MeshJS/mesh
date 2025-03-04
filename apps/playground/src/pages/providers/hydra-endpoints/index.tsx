import { HydraProvider } from "@meshsdk/hydra";

import FetcherAddressUtxos from "../fetchers/fetch-address-utxos";
import FetcherProtocolParameters from "../fetchers/fetch-protocol-parameters";
import HydraInitializeHead from "./init-head";
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
      <HydraInitializeHead provider={provider} providerName={providerName} />
      <HydraOnMessage provider={provider} providerName={providerName} />

      <FetcherAddressUtxos provider={provider} providerName={providerName} />
      <FetcherProtocolParameters
        provider={provider}
        providerName={providerName}
      />
    </>
  );
}
