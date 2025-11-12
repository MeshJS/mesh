import { ClientMessage, hydraStatus, HydraProvider, ServerOutput } from "@meshsdk/hydra";
import { Observable } from "rxjs";

export type HydraProviderOptions = ConstructorParameters<typeof HydraProvider>[0];

// Utility type: extracts the keys of T whose values are async functions (return Promise)
export type AsyncMethodNames<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => Promise<any> ? K : never;
  }[keyof T];
  
  // Utility type: transforms any async function signature into one that returns an Observable
  type ObservableMethod<T extends (...args: any[]) => Promise<any>> = (
    ...args: Parameters<T>
  ) => Observable<Awaited<ReturnType<T>>>;
  
  // Utility type: for all async methods in T, map them to observable forms
  type ReplaceAsyncWithObservable<T> = {
    [K in AsyncMethodNames<T>]: T[K] extends (...args: any[]) => Promise<any>
      ? ObservableMethod<T[K]>
      : never;
  };
  
  // Utility type: retains all sync methods in T without change
  type PreserveSyncMethods<T> = {
    [K in Exclude<keyof T, AsyncMethodNames<T>>]: T[K];
  };
  
  // Exported type: HydraReactive wraps HydraProvider to expose asyncs as observables and includes onMessage/onStatusChange
  export type HydraReactive = ReplaceAsyncWithObservable<HydraProvider> &
    PreserveSyncMethods<HydraProvider> & {
      onMessage: (
        listener: (message: ServerOutput | ClientMessage) => void
      ) => () => void;
      onStatusChange: (listener: (status: hydraStatus) => void) => () => void;
    };
  