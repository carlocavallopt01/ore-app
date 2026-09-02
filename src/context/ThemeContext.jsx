import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { isRomeDaytime } from "../lib/time";

const STORAGE_KEY = "ore-theme-mode"; // "auto" | "light" | "dark"

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem(STORAGE_KEY) || "auto");
  const [autoIsDark, setAutoIsDark] = useState(() => !isRomeDaytime());

  useEffect(() => {
    const tick = () => setAutoIsDark(!isRomeDaytime());
    tick();
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const isDark = mode === "auto" ? autoIsDark : mode === "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "auto" ? "light" : prev === "light" ? "dark" : "auto";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, isDark, cycleMode }), [mode, isDark, cycleMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve essere usato dentro ThemeProvider");
  return ctx;
}
