import { HydraProvider } from "@meshsdk/hydra";
import type {
  ClientMessage,
  hydraStatus,
  ServerOutput,
} from "@meshsdk/hydra";
import { BehaviorSubject, from, type Observable } from "rxjs";

import type { HydraProviderOptions, HydraReactive } from "../types";

// The HydraReactiveClient wraps a HydraProvider and creates observable-based APIs
export class HydraReactiveClient {
  // Underlying HydraProvider instance
  private readonly provider: HydraProvider;

  // Rxjs subject to emit latest status change (or null at start)
  private readonly statusSubject = new BehaviorSubject<hydraStatus | null>(
    null
  );

  // Rxjs subject to emit latest server/client message (or null at start)
  private readonly messageSubject = new BehaviorSubject<
    ServerOutput | ClientMessage | null
  >(null);

  // In-memory list of all registered message listeners (not managed by provider)
  private readonly messageListeners = new Set<
    (message: ServerOutput | ClientMessage) => void
  >();

  // Expose Observable for status
  private readonly observable_status: Observable<hydraStatus | null>;

  // Expose Observable for new messages
  private readonly observable_message: Observable<
    ServerOutput | ClientMessage | null
  >;

  // Reactive proxy implementing HydraReactive interface
  private readonly reactive: HydraReactive;

  constructor(options: HydraProviderOptions) {
    // Initialize wrapped HydraProvider with user-supplied options
    this.provider = new HydraProvider(options);

    // Prepare status$ and messages$ observables
    this.observable_status = this.statusSubject.asObservable();
    this.observable_message = this.messageSubject.asObservable();

    // Listen to provider's status changes and emit to statusSubject
    this.provider.onStatusChange((status) => {
      this.statusSubject.next(status);
    });

    // Listen to provider's messages and:
    // 1) emit to messageSubject
    // 2) invoke all listeners in messageListeners set
    this.provider.onMessage((message) => {
      this.messageSubject.next(message);
      this.messageListeners.forEach((listener) => listener(message));
    });

    // Create the proxy exposing HydraReactive-compliant API
    this.reactive = this.createReactiveProxy();
  }

  // Exposes the proxy API to outside users (all methods are reactive)
  get hydra(): HydraReactive {
    return this.reactive;
  }

  // Observable of hydraStatus, emits on every change (null as initial value)
  get status$(): Observable<hydraStatus | null> {
    return this.status$Instance;
  }

  // Observable of ServerOutput | ClientMessage, emits on every message (null at start)
  get messages$(): Observable<ServerOutput | ClientMessage | null> {
    return this.messages$Instance;
  }

  // Synchronous getter for the latest status value (null at start)
  get latestStatus(): hydraStatus | null {
    return this.statusSubject.getValue();
  }

  // Synchronous getter for most recent message (null at start)
  get latestMessage(): ServerOutput | ClientMessage | null {
    return this.messageSubject.getValue();
  }

  // Release all listener references and reset onMessage handler in provider
  teardown() {
    this.messageListeners.clear();
    // Reset the provider callbacks so completed subjects are not invoked post teardown
    this.provider.onMessage(() => undefined);
  }

  // Internal: builds a Proxy on provider which adapts async to observable and binds onMessage/onStatusChange custom logic
  private createReactiveProxy(): HydraReactive {
    const client = this;

    const proxy = new Proxy(this.provider, {
      get(target, prop, receiver) {
        // Hijack .onMessage for custom event management (add/remove listener from messageListeners set)
        if (prop === "onMessage") {
          return (
            listener: (message: ServerOutput | ClientMessage) => void
          ) => {
            client.messageListeners.add(listener);
            return () => client.messageListeners.delete(listener);
          };
        }

        // Hijack .onStatusChange: subscribe to statusSubject observable, invoke listener unless null
        if (prop === "onStatusChange") {
          return (listener: (status: hydraStatus) => void) => {
            const subscription = client.statusSubject.subscribe((status) => {
              if (status !== null) {
                listener(status);
              }
            });
            // Return unsubscribe closure
            return () => subscription.unsubscribe();
          };
        }

        // Get usual property (sync or async method)
        const value = Reflect.get(target, prop, receiver);

        // If a function, and returns Promise, wrap so caller sees an Observable instead
        if (typeof value === "function") {
          return (...args: any[]) => {
            const result = value.apply(target, args);
            if (result && typeof result.then === "function") {
              return from(result);
            }
            return result;
          };
        }

        // For all other properties, forward as is (e.g., property, sync value)
        return value;
      },
    });

    return proxy as unknown as HydraReactive;
  }
}

// Export hydra types for consumer convenience
export type { ClientMessage, hydraStatus, ServerOutput };

