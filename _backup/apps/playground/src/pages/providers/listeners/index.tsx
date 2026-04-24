import {
  BlockfrostProvider,
  KoiosProvider,
  MaestroProvider,
  U5CProvider,
  YaciProvider,
} from "@meshsdk/core";

import ListenerOnTransactionConfirmed from "./on-transaction-confirmed";

export default function ProviderListeners({
  provider,
  providerName,
}: {
  provider: SupportedListeners;
  providerName: string;
}) {
  return (
    <>
      <ListenerOnTransactionConfirmed
        provider={provider}
        providerName={providerName}
      />
    </>
  );
}

export type SupportedListeners =
  | BlockfrostProvider
  | YaciProvider
  | MaestroProvider
  | KoiosProvider
  | U5CProvider;
