import { useState } from "react";

import { HydraConfigContext } from "../context/configContext";
import { HydraProviderOptions } from "../types";
import { HydraReactProvider } from "./hydraReactProvider";

export function MeshHydraProvider({ children }: { children: React.ReactNode }) {
  const [hydraConfig, setHydraConfig] = useState<HydraProviderOptions>(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = localStorage.getItem("hydra-config");
        if (stored) {
          return JSON.parse(stored) as HydraProviderOptions;
        }
      }
    } catch (error) {
      console.warn("Failed to load hydra config from localStorage:", error);
    }
    return {} as HydraProviderOptions;
  });

  const setHydraConfigHandler = (partial: Partial<HydraProviderOptions>) => {
    setHydraConfig((prev) => {
      const newConfig = { ...prev, ...partial };
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          localStorage.setItem("hydra-config", JSON.stringify(newConfig));
        }
      } catch (error) {
        console.warn("Failed to save hydra config to localStorage:", error);
      }
      return newConfig;
    });
  };

  return (
    <HydraConfigContext.Provider
      value={{
        hydraConfig,
        setHydraConfig: setHydraConfigHandler,
      }}
    >
      <HydraReactProvider options={hydraConfig}>{children}</HydraReactProvider>
    </HydraConfigContext.Provider>
  );
}
