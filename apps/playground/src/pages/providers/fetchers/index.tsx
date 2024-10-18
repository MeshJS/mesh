import {
  BlockfrostProvider,
  KoiosProvider,
  MaestroProvider,
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
import FetcherProtocolParameters from "./fetch-protocol-parameters";
import FetcherTransactionInfo from "./fetch-transaction-info";
import FetcherGet from "./get";

export default function ProviderFetchers({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  provider: string;
}) {
  return (
    <>
      <FetcherGet blockchainProvider={blockchainProvider} provider={provider} />

      <FetcherAccountInfo
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
      <FetcherAddressAssets
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
      <FetcherAddressUtxos
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
      <FetcherAssetAddresses
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
      <FetcherAssetMetadata
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
      <FetcherBlockInfo
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
      <FetcherCollectionAssets
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
      <FetcherHandleAddress
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
      <FetcherHandle
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
      <FetcherProtocolParameters
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
      <FetcherTransactionInfo
        blockchainProvider={blockchainProvider}
        provider={provider}
      />
    </>
  );
}

export type SupportedFetchers =
  | BlockfrostProvider
  | KoiosProvider
  | YaciProvider
  | MaestroProvider
  | U5CProvider;
