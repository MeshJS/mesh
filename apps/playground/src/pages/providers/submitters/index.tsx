import {
  BlockfrostProvider,
  KoiosProvider,
  MaestroProvider,
  OgmiosProvider,
  YaciProvider,
} from "@meshsdk/core";

import SubmitterSubmitTransaction from "./submit-transaction";

export default function ProviderSubmitters({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedSubmitters;
  provider: string;
}) {
  return (
    <>
      <SubmitterSubmitTransaction
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
    </>
  );
}

export type SupportedSubmitters =
  | BlockfrostProvider
  | YaciProvider
  | MaestroProvider
  | KoiosProvider
  | OgmiosProvider;
