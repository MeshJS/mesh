import { createContext, ReactNode } from "react";

import type { HydraProviderOptions } from "../types";

export interface HydraReactContextValue extends HydraProviderOptions {}

export interface HydraReactProviderProps {
  children: ReactNode;
  options: HydraProviderOptions;
}

export const HydraReactContext = createContext<HydraReactContextValue | undefined>(undefined);

