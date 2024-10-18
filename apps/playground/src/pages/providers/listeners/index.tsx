import {
  BlockfrostProvider,
  KoiosProvider,
  MaestroProvider,
  U5CProvider,
  YaciProvider,
} from "@meshsdk/core";

import ListenerOnTransactionConfirmed from "./on-transaction-confirmed";

export default function ProviderListeners({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedListeners;
  provider: string;
}) {
  return (
    <>
      <ListenerOnTransactionConfirmed
        blockchainProvider={blockchainProvider}
        provider={provider}
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
