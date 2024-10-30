import { YaciProvider } from "@meshsdk/core";

import YaciDevnetInfo from "./devnet-info";
import YacigetGenesisByEra from "./genesis-info-era";
import YaciTopupAddress from "./topup-address";

export default function ProviderYaciEndpoints({
  yaciProvider,
  provider,
}: {
  yaciProvider: YaciProvider;
  provider: string;
}) {
  return (
    <>
      <YaciDevnetInfo yaciProvider={yaciProvider} provider={provider} />
      <YacigetGenesisByEra
        yaciProvider={yaciProvider}
        provider={provider}
      />
      <YaciTopupAddress yaciProvider={yaciProvider} provider={provider} />
    </>
  );
}
