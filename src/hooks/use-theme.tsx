import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Day/Night theme management.
 *
 * Persistence: a user's explicit choice is stored in localStorage under
 * THEME_STORAGE_KEY. If no choice has been made we follow the OS-level
 * `prefers-color-scheme`. Tokens for both palettes live in `src/index.css`.
 */
export const THEME_STORAGE_KEY = "steelflow:theme";

export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "system";

interface ThemeContextValue {
  /** Resolved theme actually applied to the document. */
  theme: ThemeMode;
  /** Raw user preference — "system" means follow OS. */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Pure resolver — exported for unit tests. */
export function resolveTheme(preference: ThemePreference, systemIsDark: boolean): ThemeMode {
  if (preference === "system") return systemIsDark ? "dark" : "light";
  return preference;
}

function applyThemeClass(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.colorScheme = mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredPreference());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  // Listen for OS theme changes only when preference === "system".
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const theme = useMemo(() => resolveTheme(preference, systemDark), [preference, systemDark]);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    if (typeof window === "undefined") return;
    if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [theme, setPreference]);

  const value = useMemo<ThemeContextValue>(() => ({ theme, preference, setPreference, toggle }), [theme, preference, setPreference, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  // Fallback for tests / isolated component renders without a provider.
  if (!ctx) {
    return {
      theme: "dark" as ThemeMode,
      preference: "system" as ThemePreference,
      setPreference: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
