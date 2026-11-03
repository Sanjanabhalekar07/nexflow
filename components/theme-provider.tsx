"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

type ThemeContextValue = { dark: boolean; toggleTheme: () => void };
const ThemeContext = createContext<ThemeContextValue>({ dark: false, toggleTheme: () => undefined });
const STORAGE_KEY = "nexflow-theme";
const THEME_EVENT = "nexflow-theme-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(THEME_EVENT, callback); };
}
function getSnapshot() { return window.localStorage.getItem(STORAGE_KEY) === "dark"; }
function getServerSnapshot() { return false; }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  const toggleTheme = () => {
    const next = !getSnapshot();
    window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  return <ThemeContext.Provider value={{ dark, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { dark, toggleTheme } = useTheme();
  return <button className="button subtle theme-toggle" type="button" onClick={toggleTheme} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} aria-pressed={dark} title={dark ? "Switch to light theme" : "Switch to dark theme"}>◐</button>;
}
