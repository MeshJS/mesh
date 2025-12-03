import { useContext } from "react";

import { HydraConfigContext } from "../context/configContext";

export function useHydraConfig() {
  const ctx = useContext(HydraConfigContext);
  if (!ctx) {
    throw new Error("useHydraConfig must be used inside <MeshHydraProvider>");
  }
  return ctx;
}
