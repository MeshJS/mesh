import { useContext } from "react";

import { HydraReactContext,HydraReactContextValue } from "../context/providerContext";
import { HydraReactProviderProps } from "../context/providerContext";

export function useHydraReactProvider(): HydraReactContextValue {
    const ctx = useContext(HydraReactContext);
  
    if (!ctx) {
      throw new Error("useHydraReactProvider must be used within HydraReactProvider");
    }
  
    return ctx;
  }
  
  export const HydraReactProvider = ({
    children,
    options,
  }: HydraReactProviderProps) => {
    return (
      <HydraReactContext.Provider value={options}>{children}</HydraReactContext.Provider>
    );
  };