import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/state/auth";
const ThemeContext = createContext({
    theme: "system",
    resolvedTheme: "light",
    setTheme: () => { }
});
const storageKey = "lsky-theme";
const readStoredTheme = () => {
    if (typeof window === "undefined")
        return null;
    const value = window.localStorage.getItem(storageKey);
    if (value === "light" || value === "dark" || value === "system") {
        return value;
    }
    return null;
};
export function ThemeProvider({ children }) {
    const userTheme = useAuthStore((state) => state.user?.themePreference);
    // Initialize theme: prioritize user theme, then stored theme, then system
    const [theme, setThemeState] = useState(() => {
        // Don't use stored theme on initial load, wait for user theme
        return "system";
    });
    const [systemTheme, setSystemTheme] = useState(() => {
        if (typeof window === "undefined") {
            return "light";
        }
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    });
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const listener = (event) => {
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
        if (typeof window === "undefined")
            return;
        // User theme preference always takes priority
        if (userTheme) {
            setThemeState(userTheme);
            // Also update localStorage to keep in sync
            window.localStorage.setItem(storageKey, userTheme);
        }
        else {
            // If no user theme, use stored theme or system
            const stored = readStoredTheme();
            if (stored) {
                setThemeState(stored);
            }
        }
    }, [userTheme]);
    const resolvedTheme = theme === "system" ? systemTheme : theme;
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        const root = document.documentElement;
        root.classList.toggle("dark", resolvedTheme === "dark");
    }, [resolvedTheme]);
    const value = useMemo(() => ({
        theme,
        resolvedTheme,
        setTheme: (next) => {
            setThemeState(next);
            if (typeof window !== "undefined") {
                window.localStorage.setItem(storageKey, next);
            }
        }
    }), [theme, resolvedTheme]);
    return _jsx(ThemeContext.Provider, { value: value, children: children });
}
export function useTheme() {
    return useContext(ThemeContext);
}
