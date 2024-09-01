import { persistNSync } from "persist-and-sync";
import { create } from "zustand";

import { KoiosSupportedNetworks } from "@meshsdk/core";

interface State {
  blockfrostKey: string | undefined;
  setBlockfrostKey: (key: string) => void;
  maestroKey:
    | { network: "Mainnet" | "Preprod" | "Preview"; apiKey: string }
    | undefined;
  setMaestroKey: (
    network: "Mainnet" | "Preprod" | "Preview",
    apiKey: string,
  ) => void;
  koiosKey: { network: KoiosSupportedNetworks; apiKey: string } | undefined;
  setKoiosKey: (network: KoiosSupportedNetworks, apiKey: string) => void;
  yaciUrl: string;
  setYaciUrl: (url: string) => void;
  ogmiosUrl: string;
  setOgmiosUrl: (url: string) => void;
}

export const useProviders = create<State>(
  persistNSync(
    (set) => ({
      blockfrostKey: undefined,
      setBlockfrostKey: (key) => set({ blockfrostKey: key }),
      maestroKey: undefined,
      setMaestroKey: (network, apiKey) =>
        set({ maestroKey: { network, apiKey } }),
      koiosKey: undefined,
      setKoiosKey: (network, apiKey) => set({ koiosKey: { network, apiKey } }),
      yaciUrl: "https://yaci-node.meshjs.dev/api/v1/",
      setYaciUrl: (url) => set({ yaciUrl: url }),
      ogmiosUrl: "",
      setOgmiosUrl: (url) => set({ ogmiosUrl: url }),
    }),
    { name: "mesh-providers" },
  ),
);
