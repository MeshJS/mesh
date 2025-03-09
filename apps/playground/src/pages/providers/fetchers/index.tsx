import {
  BlockfrostProvider,
  KoiosProvider,
  MaestroProvider,
  OfflineFetcher,
  U5CProvider,
  YaciProvider,
} from "@meshsdk/core";

import FetcherAccountInfo from "./fetch-account-info";
import FetcherAddressAssets from "./fetch-address-assets";
import FetcherAddressUtxos from "./fetch-address-utxos";
import FetcherAssetAddresses from "./fetch-asset-addresses";
import FetcherAssetMetadata from "./fetch-asset-metadata";
import FetcherBlockInfo from "./fetch-block-info";
import FetcherCollectionAssets from "./fetch-collection-assets";
import FetcherHandle from "./fetch-handle";
import FetcherHandleAddress from "./fetch-handle-address";
import FetcherProposalInfo from "./fetch-proposals";
import FetcherProtocolParameters from "./fetch-protocol-parameters";
import FetcherTransactionInfo from "./fetch-transaction-info";
import FetcherUtxos from "./fetch-utxos";
import FetcherGet from "./get";

export default function ProviderFetchers({
  provider,
  providerName,
}: {
  provider: SupportedFetchers;
  providerName: string;
}) {
  return (
    <>
      <FetcherGet provider={provider} providerName={providerName} />

      <FetcherAccountInfo
        provider={provider}
        providerName={providerName}
      />
      <FetcherAddressAssets
        provider={provider}
        providerName={providerName}
      />
      <FetcherAddressUtxos
        provider={provider}
        providerName={providerName}
      />
      <FetcherAssetAddresses
        provider={provider}
        providerName={providerName}
      />
      <FetcherAssetMetadata
        provider={provider}
        providerName={providerName}
      />
      <FetcherBlockInfo
        provider={provider}
        providerName={providerName}
      />
      <FetcherCollectionAssets
        provider={provider}
        providerName={providerName}
      />
      <FetcherHandleAddress
        provider={provider}
        providerName={providerName}
      />
      <FetcherHandle
        provider={provider}
        providerName={providerName}
      />
      <FetcherProtocolParameters
        provider={provider}
        providerName={providerName}
      />
      <FetcherTransactionInfo
        provider={provider}
        providerName={providerName}
      />
      <FetcherUtxos
        provider={provider}
        providerName={providerName}
      />
      <FetcherProposalInfo
        provider={provider}
        providerName={providerName}
      />
    </>
  );
}

export type SupportedFetchers =
  | BlockfrostProvider
  | KoiosProvider
  | YaciProvider
  | MaestroProvider
  | U5CProvider
  | OfflineFetcher;
