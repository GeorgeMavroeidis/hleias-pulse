export type ThemePreference = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";
export const THEME_STORAGE_KEY = "hp.color-scheme.v1";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveColorScheme(preference: ThemePreference, systemDark: boolean): ColorScheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}
export function saveThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* The in-memory preference still works without storage. */
  }
}
