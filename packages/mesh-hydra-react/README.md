# @meshsdk/hydra-react

React bindings that make the async APIs from `@meshsdk/hydra` reactive with RxJS observables.

## Installation

```bash
npm install @meshsdk/hydra-react
```

## Quick Start

Wrap your application (or the subtree that needs access) in `HydraReactProvider`. Then call `useHydra()` from any component to access the reactive Hydra client.

```tsx
import { HydraReactProvider, useHydra } from "@meshsdk/hydra-react";

const HydraStatus = () => {
  const { hydra, status, lastMessage } = useHydra();

  const handleInit = () => {
    hydra.connect().subscribe({
      complete() {
        hydra.init().subscribe();
      },
    });
  };

  return (
    <section>
      <p>Current status: {status ?? "unknown"}</p>
      <pre>{JSON.stringify(lastMessage, null, 2)}</pre>
      <button onClick={handleInit}>Init Hydra Head</button>
    </section>
  );
};

export const App = () => (
  <HydraReactProvider
    httpUrl="http://localhost:4001"
    wsUrl="ws://localhost:4002"
    autoConnect
  >
    <HydraStatus />
  </HydraReactProvider>
);
```

## API Highlights

- `HydraReactProvider` — initializes a single Hydra client instance and places it in React context. Pass the same constructor options you would give `HydraProvider` (`httpUrl`, `wsUrl`, etc.).
- `autoConnect` prop — optional flag to call `hydra.connect()` automatically when the provider mounts.
- `useHydra()` — returns:
  - `hydra`: proxy around `HydraProvider`. Every async method now yields an `Observable` you can subscribe to or compose with RxJS operators.
  - `status` and `lastMessage`: React state snapshots of the latest status/message.
  - `status$` and `messages$`: the underlying observables for advanced scenarios.

### Working with Observables

Because each async method now emits through RxJS, you can combine Hydra calls with other streams:

```tsx
import { mergeMap } from "rxjs";

const { hydra } = useHydra();

hydra.connect()
  .pipe(mergeMap(() => hydra.newTx({
    type: "Tx ConwayEra",
    description: "Example",
    cborHex: "...",
  })))
  .subscribe({
    next(txId) {
      console.log("Submitted tx", txId);
    },
    error(error) {
      console.error("Hydra newTx failed", error);
    },
  });
```

## Cleanup

When the provider unmounts it tears down subscriptions automatically. If you need to dispose manually (for testing, etc.), call `client.teardown()` via the context or unmount the provider.

## Feedback

Please report issues or suggestions on the main Mesh SDK repository.

