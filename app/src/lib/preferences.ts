export type ThemeMode = "light" | "dark";
export type Locale = "en" | "zh";

const THEME_KEY = "accounting-copilot.theme";
const LOCALE_KEY = "accounting-copilot.locale";

export function loadTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function saveTheme(theme: ThemeMode): void {
  localStorage.setItem(THEME_KEY, theme);
}

export function loadLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_KEY);
  if (stored === "en" || stored === "zh") {
    return stored;
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function saveLocale(locale: Locale): void {
  localStorage.setItem(LOCALE_KEY, locale);
}

export function applyThemeClass(theme: ThemeMode): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
