"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ThemeContextValue = { dark: boolean; toggleTheme: () => void };
const ThemeContext = createContext<ThemeContextValue>({ dark: false, toggleTheme: () => undefined });
const STORAGE_KEY = "nexflow-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) === "dark";
    setDark(saved);
    document.documentElement.classList.toggle("dark", saved);
  }, []);
  const toggleTheme = () => {
    setDark((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
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
