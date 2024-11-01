import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  yaciAdminUrl: string;
  setYaciAdminUrl: (url: string) => void;
  ogmiosUrl: string;
  setOgmiosUrl: (url: string) => void;
  utxorpc: { url: string; key: string };
  setUTxORPC: (url: string, key: string) => void;
  hydraUrl: string;
  setHydraUrl: (url: string) => void;
}

export const useProviders = create<State>()(
  persist(
    (set, get) => ({
      blockfrostKey: undefined,
      setBlockfrostKey: (key) => set({ blockfrostKey: key }),
      maestroKey: undefined,
      setMaestroKey: (network, apiKey) =>
        set({ maestroKey: { network, apiKey } }),
      koiosKey: undefined,
      setKoiosKey: (network, apiKey) => set({ koiosKey: { network, apiKey } }),
      yaciUrl: "https://yaci-node.meshjs.dev/api/v1/",
      setYaciUrl: (url) => set({ yaciUrl: url }),
      yaciAdminUrl: "http://localhost:10000/",
      setYaciAdminUrl: (url) => set({ yaciAdminUrl: url }),
      ogmiosUrl: "",
      setOgmiosUrl: (url) => set({ ogmiosUrl: url }),
      utxorpc: { url: "http://localhost:50051", key: "api-key" },
      setUTxORPC: (url, key) => set({ utxorpc: { url, key } }),
      hydraUrl: "",
      setHydraUrl: (url) => set({ hydraUrl: url }),
    }),
    {
      name: "mesh-providers",
    },
  ),
);
