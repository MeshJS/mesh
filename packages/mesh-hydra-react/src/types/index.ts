import type { Observable } from "rxjs";

import type {
  ClientMessage,
  HydraProvider,
  hydraStatus,
  ServerOutput,
} from "../../../mesh-hydra/src";

export type HydraProviderOptions = ConstructorParameters<
  typeof HydraProvider
>[0];

type AsyncMethods<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => Promise<any> ? K : never;
}[keyof T];

type AsyncToObservable<T extends (...args: any[]) => Promise<any>> = (
  ...args: Parameters<T>
) => Observable<Awaited<ReturnType<T>>>;

type WrapAsyncWithObservable<T> = {
  [K in AsyncMethods<T>]: T[K] extends (...args: any[]) => Promise<any>
    ? AsyncToObservable<T[K]>
    : never;
};

type KeepSyncMethods<T> = Omit<T, AsyncMethods<T>>;

export type HydraReactive = WrapAsyncWithObservable<HydraProvider> &
  KeepSyncMethods<HydraProvider> & {
    onMessage: (
      listener: (message: ServerOutput | ClientMessage) => void,
    ) => () => void;
    onStatusChange: (listener: (status: hydraStatus) => void) => () => void;
  };
