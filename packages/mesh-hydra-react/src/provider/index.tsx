// Import React types and hooks
import type { ReactNode } from "react";
import { createContext, useEffect, useRef } from "react";

// Import Hydra provider options type and client implementation
import type { HydraProviderOptions } from "../types";
import { HydraReactiveClient } from "../reactive-client";

// Define the interface for our context's value
/*
  This interface specifies the single value (`client`) to be provided via context.
  The client gives downstream access to Hydra API and observables.
*/
interface InternalContextValue {
  client: HydraReactiveClient;
}

// Create a React Context for Hydra, with null as initial value.
/*
  This is our global context instance that exposes the HydraReactiveClient
  to any child component via Context API.
*/
const HydraContext = createContext<InternalContextValue | null>(null);

// Props for the HydraReactProvider
/*
  - Inherits from HydraProviderOptions (connection info etc)
  - Accepts 'children' (any ReactNode) to render within the provider
  - autoConnect?: if true, establishes connection automatically on mount
*/
export interface HydraReactProviderProps extends HydraProviderOptions {
  children: ReactNode;
  autoConnect?: boolean;
}

// React Provider component for HydraClient, providing to child components
export const HydraReactProvider = ({
  children,
  autoConnect = false,
  ...options
}: HydraReactProviderProps) => {
  // Reference to the singleton HydraReactiveClient instance.
  /*
    useRef allows us to hold the client instance for the component lifetime.
    Avoids re-creating on every render.
  */
  const clientRef = useRef<HydraReactiveClient>();

  // Store the options that were used for initial creation (for change detection).
  /*
    This tracks the initial options so we can warn if the parent tries to
    change options while the provider is mounted (which would be ignored).
  */
  const initialOptionsRef = useRef<HydraProviderOptions | null>(null);

  // Track if we've already warned about changing options (only warn once).
  /*
    This prevents spamming the console with repeated warnings
    if the props change after mount.
  */
  const hasWarnedOnOptionsChange = useRef(false);

  // On first mount, create the HydraReactiveClient + store initial options.
  /*
    If the client doesn't exist, instantiate it with the current props/options.
    Otherwise, if options may have changed, check if any tracked option value 
    has changed compared to initial mount. If so, warn (since hydra config won't actually update).
  */
  if (!clientRef.current) {
    clientRef.current = new HydraReactiveClient(options);
    initialOptionsRef.current = { ...options };
  } else if (!hasWarnedOnOptionsChange.current) {
    // List of keys on which to check for changes.
    const trackedKeys: (keyof HydraProviderOptions)[] = [
      "httpUrl",
      "wsUrl",
      "address",
      "history",
    ];

    // Determine if any tracked property has changed since initial creation.
    const hasChanged = trackedKeys.some((key) => {
      const initial = initialOptionsRef.current?.[key];
      const next = options[key];
      return initial !== next;
    });

    // If options changed, warn user to remount for them to take effect.
    if (hasChanged) {
      console.warn(
        "HydraReactProvider props changed after initial mount. Please remount the provider to apply new configuration.",
      );
      hasWarnedOnOptionsChange.current = true;
    }
  }

  // Optionally connect to Hydra node automatically on mount (if enabled).
  /*
    This useEffect runs when 'autoConnect' changes.
    If autoConnect is true, it calls .connect() on the hydra client and subscribes.
    Any error is logged.
    Subscription is cleaned up on unmount or autoConnect change.
  */
  useEffect(() => {
    if (!autoConnect || !clientRef.current) {
      return;
    }

    const subscription = clientRef.current.hydra.connect().subscribe({
      error(error) {
        console.error("HydraReactProvider autoConnect failed", error);
      },
    });

    return () => subscription.unsubscribe();
  }, [autoConnect]);

  // Clean up Hydra client when provider unmounts
  /*
    On unmount, call client.teardown() to release all resources/subscriptions.
    This avoids leaks and stuck connections.
  */
  useEffect(() => {
    return () => {
      clientRef.current?.teardown();
    };
  }, []);

  // Safety check -- in the rare case clientRef was not initialized.
  /*
    If for some reason the client wasn't created, throw an error to help debugging.
    This should never happen but defends against programming mistakes.
  */
  if (!clientRef.current) {
    throw new Error("HydraReactProvider failed to initialize Hydra client");
  }

  // Render the provider, making the Hydra client available to all children via context.
  /*
    The HydraContext.Provider is the actual React context provider.
    It passes { client } as the value for use in child components.
  */
  return (
    <HydraContext.Provider value={{ client: clientRef.current }}>
      {children}
    </HydraContext.Provider>
  );
};

// Export the context for use in custom hooks or consumers
export { HydraContext };
