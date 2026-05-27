import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  defaultThemePalette,
  isThemePalette,
  type ThemePalette
} from "@/lib/theme-palettes";
import { useAuthStore } from "@/state/auth";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  palette: ThemePalette;
  setTheme: (theme: Theme) => void;
  setPalette: (palette: ThemePalette) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  palette: defaultThemePalette,
  setTheme: () => {},
  setPalette: () => {}
});

const storageKey = "skyimage-theme";
const paletteStorageKey = "skyimage-theme-palette";

const readStoredTheme = (): Theme | null => {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(storageKey);
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return null;
};

const readStoredPalette = (): ThemePalette => {
  if (typeof window === "undefined") return defaultThemePalette;
  const value = window.localStorage.getItem(paletteStorageKey);
  return isThemePalette(value) ? value : defaultThemePalette;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const userTheme = useAuthStore((state) => state.user?.themePreference as Theme | undefined);
  
  // Initialize theme: prioritize user theme, then stored theme, then system
  const [theme, setThemeState] = useState<Theme>(() => {
    // Don't use stored theme on initial load, wait for user theme
    return "system";
  });
  const [palette, setPaletteState] = useState<ThemePalette>(readStoredPalette);
  
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // User theme preference always takes priority
    if (userTheme) {
      setThemeState(userTheme);
      // Also update localStorage to keep in sync
      window.localStorage.setItem(storageKey, userTheme);
    } else {
      // If no user theme, use stored theme or system
      const stored = readStoredTheme();
      if (stored) {
        setThemeState(stored);
      }
    }
  }, [userTheme]);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    root.dataset.palette = palette;
    window.localStorage.setItem(paletteStorageKey, palette);
  }, [palette]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      palette,
      setTheme: (next: Theme) => {
        setThemeState(next);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(storageKey, next);
        }
      },
      setPalette: (next: ThemePalette) => {
        setPaletteState(next);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(paletteStorageKey, next);
        }
      }
    }),
    [theme, resolvedTheme, palette]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
