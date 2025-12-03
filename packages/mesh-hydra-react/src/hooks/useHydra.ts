import { useEffect, useMemo, useState } from "react";
import { Observable } from "rxjs";

import { useHydraReactProvider } from "../provider/hydraReactProvider";
import { HydraReactiveClient } from "../reactive-client";

function useObservableValue<T>(observable: Observable<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    const subscription = observable.subscribe((value) => setValue(value));
    return () => subscription.unsubscribe();
  }, [observable]);

  return value;
}

/**
 * `useHydra` — React hook for accessing a HydraReactiveClient.
 *
 * Usage:
 * - With provider (default):
 *    ```tsx
 *    const { hydra, status, message } = useHydra();
 *    ```
 *   Uses options from `<HydraReactProvider>`.:
 *    ```tsx
 *    useHydra({ httpUrl: "http://localhost:4001" });
 *    ```
 *   Uses the provided options.
 *
 * @param providerOptions Optional. If provided, replaces the provider's config.
 * @returns { hydra, status, message } Reactive client API + live status/message streams.
 */
export const useHydra = () => {
  const contextOptions = useHydraReactProvider();
  const client = useMemo(() => {
    return new HydraReactiveClient(contextOptions);
  }, [contextOptions]);

  const status = useObservableValue(client.status$, client.latestStatus);
  const message = useObservableValue(client.messages$, client.latestMessage);

  useEffect(() => {
    return () => client.teardown();
  }, [client]);

  return {
    hydra: client.hydra,
    status,
    message,
  };
};
