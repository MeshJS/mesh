// React hooks and type imports
import { useEffect, useMemo, useState } from "react";
import type { Observable } from "rxjs";
import type {
  ClientMessage,
  hydraStatus,
  ServerOutput,
} from "@meshsdk/hydra";

// Internal client and type imports
import { HydraReactiveClient } from "../reactive-client";
import type { HydraProviderOptions, HydraReactive } from "../types";

// Custom hook to subscribe to an RxJS Observable and keep its latest value in React state
function useObservableValue<T>(
  observable: Observable<T>,
  initial: T
): T {
  // Keeps track of the current value of the observable
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    // Subscribe to the observable and update the state on new values
    const subscription = observable.subscribe((nextValue) => {
      setValue(nextValue);
    });

    // Unsubscribe on cleanup to avoid memory leaks
    return () => subscription.unsubscribe();
  }, [observable]);

  return value;
}

// Defines the data returned by the useHydra hook
export interface IUseHydra {
  hydra: HydraReactive; // Proxy to interact with Hydra backend
  status: hydraStatus | null; // Latest status from Hydra as plain value
  message: ServerOutput | ClientMessage | null; // Most recent message received/sent
  observable_status: Observable<hydraStatus | null>; // Observable emitting status changes
  observable_message: Observable<ServerOutput | ClientMessage | null>; // Observable emitting messages
}

// Main React hook to provide Hydra client functionality
export const useHydra = (
  hydraParameters: HydraProviderOptions
): IUseHydra => {
  // Memoize the HydraReactiveClient to ensure it's only recreated when options change
  const client = useMemo(
    () => new HydraReactiveClient(hydraParameters),
    // specify which props trigger a new client instance
    [
      hydraParameters.httpUrl,
      hydraParameters.wsUrl,
      hydraParameters.address,
      hydraParameters.history,
    ]
  );

  // Cleanup Hydra client when component unmounts or client changes
  useEffect(() => {
    return () => {
      client.teardown();
    };
  }, [client]);

  // Get latest status and latest message values from Hydra client observables
  const status = useObservableValue(client.status$, client.latestStatus);
  const message = useObservableValue(
    client.messages$,
    client.latestMessage
  );

  // Return Hydra proxy, reactive status and message values, and their observables
  return {
    hydra: client.hydra,
    status,
    observable_status: client.status$,
    message,
    observable_message: client.messages$,
  };
};

