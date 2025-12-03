import type { Observable } from "rxjs";
import { BehaviorSubject, from } from "rxjs";

import type {
  ClientMessage,
  hydraStatus,
  ServerOutput,
} from "../../../mesh-hydra/src";
import type { HydraProviderOptions, HydraReactive } from "../types";
import { HydraProvider } from "../../../mesh-hydra/src";

export class HydraReactiveClient {
  private readonly provider: HydraProvider;
  private readonly statusSubject = new BehaviorSubject<hydraStatus | null>(
    null,
  );
  private readonly messageSubject = new BehaviorSubject<
    ServerOutput | ClientMessage | null
  >(null);
  private readonly messageListeners = new Set<
    (message: ServerOutput | ClientMessage) => void
  >();
  private readonly reactive: HydraReactive;

  constructor(options: HydraProviderOptions) {
    this.provider = new HydraProvider(options);
    this.setupEventHandlers();
    this.reactive = this.createReactiveProxy();
  }

  get hydra(): HydraReactive {
    return this.reactive;
  }

  get status$(): Observable<hydraStatus | null> {
    return this.statusSubject.asObservable();
  }

  get messages$(): Observable<ServerOutput | ClientMessage | null> {
    return this.messageSubject.asObservable();
  }

  get latestStatus(): hydraStatus | null {
    return this.statusSubject.getValue();
  }

  get latestMessage(): ServerOutput | ClientMessage | null {
    return this.messageSubject.getValue();
  }

  teardown(): void {
    this.messageListeners.clear();
    this.statusSubject.complete();
    this.messageSubject.complete();
    this.provider.onMessage(() => undefined);
  }

  private setupEventHandlers(): void {
    this.provider.onStatusChange((status) => {
      this.statusSubject.next(status);
    });

    this.provider.onMessage((message) => {
      this.messageSubject.next(message);
      this.messageListeners.forEach((listener) => listener(message));
    });
  }

  private createReactiveProxy(): HydraReactive {
    const client = this;

    return new Proxy(this.provider, {
      get(target, prop, receiver) {
        if (prop === "onMessage") {
          return (
            listener: (message: ServerOutput | ClientMessage) => void,
          ) => {
            client.messageListeners.add(listener);
            return () => client.messageListeners.delete(listener);
          };
        }

        if (prop === "onStatusChange") {
          return (listener: (status: hydraStatus) => void) => {
            const subscription = client.statusSubject.subscribe((status) => {
              if (status !== null) {
                listener(status);
              }
            });
            return () => subscription.unsubscribe();
          };
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          return (...args: any[]) => {
            const result = value.apply(target, args);
            return result?.then ? from(result) : result;
          };
        }

        return value;
      },
    }) as unknown as HydraReactive;
  }
}