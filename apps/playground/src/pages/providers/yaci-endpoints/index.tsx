import { YaciProvider } from "@meshsdk/core";

import YaciDevnetInfo from "./devnet-info";
import YacigetGenesisByEra from "./genesis-info-era";
import YaciTopupAddress from "./topup-address";

export default function ProviderYaciEndpoints({
  provider,
  providerName,
}: {
  provider: YaciProvider;
  providerName: string;
}) {
  return (
    <>
      <YaciDevnetInfo provider={provider} providerName={providerName} />
      <YacigetGenesisByEra
        provider={provider}
        providerName={providerName}
      />
      <YaciTopupAddress provider={provider} providerName={providerName} />
    </>
  );
}
