"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type EnvironmentFilter = "all" | "training" | "actual";

interface EnvironmentFilterContextType {
  envFilter: EnvironmentFilter;
  setEnvFilter: (v: EnvironmentFilter) => void;
}

const EnvironmentFilterContext = createContext<EnvironmentFilterContextType>({
  envFilter: "all",
  setEnvFilter: () => {},
});

export function EnvironmentFilterProvider({ children }: { children: ReactNode }) {
  const [envFilter, setEnvFilter] = useState<EnvironmentFilter>("all");
  return (
    <EnvironmentFilterContext.Provider value={{ envFilter, setEnvFilter }}>
      {children}
    </EnvironmentFilterContext.Provider>
  );
}

export function useEnvironmentFilter() {
  return useContext(EnvironmentFilterContext);
}
