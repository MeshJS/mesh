import { createContext } from "react";
import { HydraProviderOptions } from "../types";

export type HydraConfigContextType = {
  hydraConfig: HydraProviderOptions;
  setHydraConfig: (config: HydraProviderOptions) => void;
};

export const HydraConfigContext = createContext<HydraConfigContextType | null>(null);
