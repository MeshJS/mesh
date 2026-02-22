"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

const RouteContext = createContext({
  currentRoute: "",
  setCurrentRoute: (route: string) => {},
});

export const RouteProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentRoute, setCurrentRoute] = useState("");

  const memoedValue = useMemo(
    () => ({
      currentRoute,
      setCurrentRoute,
    }),
    [currentRoute, setCurrentRoute]
  );

  return (
    <RouteContext.Provider value={memoedValue}>
      {children}
    </RouteContext.Provider>
  );
};

export function useRouteContext() {
  return useContext(RouteContext);
}
