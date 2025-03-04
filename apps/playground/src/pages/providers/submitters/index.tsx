import {
  BlockfrostProvider,
  KoiosProvider,
  MaestroProvider,
  OgmiosProvider,
  U5CProvider,
  YaciProvider,
} from "@meshsdk/core";

import SubmitterSubmitTransaction from "./submit-transaction";

export default function ProviderSubmitters({
  provider,
  providerName,
}: {
  provider: SupportedSubmitters;
  providerName: string;
}) {
  return (
    <>
      <SubmitterSubmitTransaction
        provider={provider}
        providerName={providerName}
      />
    </>
  );
}

export type SupportedSubmitters =
  | BlockfrostProvider
  | YaciProvider
  | MaestroProvider
  | KoiosProvider
  | OgmiosProvider
  | U5CProvider;
