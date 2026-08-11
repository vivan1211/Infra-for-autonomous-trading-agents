"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface TickerPreferencesContextType {
  showTicker: boolean;
  setShowTicker: (v: boolean) => void;
}

const TickerPreferencesContext = createContext<TickerPreferencesContextType>({
  showTicker: true,
  setShowTicker: () => {},
});

const STORAGE_KEY = "af_show_ticker";

export function TickerPreferencesProvider({ children }: { children: ReactNode }) {
  const [showTicker, setShowTickerState] = useState(true);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setShowTickerState(stored === "true");
  }, []);

  const setShowTicker = (v: boolean) => {
    setShowTickerState(v);
    localStorage.setItem(STORAGE_KEY, String(v));
  };

  return (
    <TickerPreferencesContext.Provider value={{ showTicker, setShowTicker }}>
      {children}
    </TickerPreferencesContext.Provider>
  );
}

export function useTickerPreferences() {
  return useContext(TickerPreferencesContext);
}
