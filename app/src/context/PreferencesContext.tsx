import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { t, tf, type MessageKey } from "../lib/i18n";
import {
  applyThemeClass,
  loadLocale,
  loadTheme,
  saveLocale,
  saveTheme,
  type Locale,
  type ThemeMode,
} from "../lib/preferences";

interface PreferencesContextValue {
  theme: ThemeMode;
  locale: Locale;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  tr: (key: MessageKey) => string;
  trf: (key: MessageKey, vars: Record<string, string | number>) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => loadTheme());
  const [locale, setLocaleState] = useState<Locale>(() => loadLocale());

  useEffect(() => {
    applyThemeClass(theme);
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveLocale(locale);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === "light" ? "dark" : "light"));
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((current) => (current === "en" ? "zh" : "en"));
  }, []);

  const tr = useCallback((key: MessageKey) => t(locale, key), [locale]);
  const trf = useCallback(
    (key: MessageKey, vars: Record<string, string | number>) => tf(locale, key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({
      theme,
      locale,
      setTheme,
      toggleTheme,
      setLocale,
      toggleLocale,
      tr,
      trf,
    }),
    [locale, setLocale, setTheme, theme, toggleLocale, toggleTheme, tr, trf],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return context;
}
