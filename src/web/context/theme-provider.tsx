import { createContext, useContext, useEffect, useState } from "react";
import { getCookie, setCookie } from "@/lib/cookies";

export type Theme = "dark" | "light" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

const DEFAULT_THEME = "system";
const THEME_COOKIE_NAME = "vite-ui-theme";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

type ThemeProviderProps = {
  children: React.ReactNode;
  storageKey?: string;
};

type ThemeProviderState = {
  resolvedTheme: ResolvedTheme;
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  resolvedTheme: "light",
  theme: DEFAULT_THEME,
  setTheme: () => null,
};

const ThemeContext = createContext<ThemeProviderState>(initialState);

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

export function ThemeProvider({ children, storageKey = THEME_COOKIE_NAME, ...props }: ThemeProviderProps) {
  const [theme, _setTheme] = useState<Theme>(() => (getCookie(storageKey) as Theme) || DEFAULT_THEME);
  // Held in state, so System mode follows the OS switching light/dark while the page is open.
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);
  const resolvedTheme: ResolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const mediaQuery = darkQuery();
    const handleChange = () => setSystemDark(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    document.querySelector("meta[name='theme-color']")?.setAttribute("content", resolvedTheme === "dark" ? "#141414" : "#ffffff");
  }, [resolvedTheme]);

  const setTheme = (theme: Theme) => {
    setCookie(storageKey, theme, THEME_COOKIE_MAX_AGE);
    _setTheme(theme);
  };

  const contextValue = {
    resolvedTheme,
    theme,
    setTheme,
  };

  return (
    <ThemeContext value={contextValue} {...props}>
      {children}
    </ThemeContext>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
