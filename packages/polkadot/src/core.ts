import { ApiPromise, WsProvider } from "@polkadot/api";
import { ApiOptions } from "@polkadot/api/types";

async function initPolkadotApi({
  provider,
  apiOptions,
}: {
  provider: {
    endpoint?: string | string[];
    autoConnectMs?: number | false;
    headers?: Record<string, string>;
    timeout?: number;
    cacheCapacity?: number;
  };
  apiOptions?: ApiOptions;
}) {
  const wsProvider = new WsProvider(
    provider.endpoint,
    provider.autoConnectMs,
    provider.headers,
    provider.timeout,
    provider.cacheCapacity
  );
  return await ApiPromise.create({ provider: wsProvider, ...apiOptions });
}

export { initPolkadotApi, ApiPromise, WsProvider };
