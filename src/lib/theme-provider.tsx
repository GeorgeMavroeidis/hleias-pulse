import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  parseThemePreference,
  readThemePreference,
  resolveColorScheme,
  saveThemePreference,
  type ThemePreference,
  type ColorScheme,
} from "./theme";

const ThemeContext = createContext<{
  preference: ThemePreference;
  colorScheme: ColorScheme;
  ready: boolean;
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // A stable server/first hydration render; the blocking bootstrap already paints the right theme.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [ready, setReady] = useState(false);
  const colorScheme = resolveColorScheme(preference, systemDark);
  useEffect(() => {
    const media = window.matchMedia(THEME_MEDIA_QUERY);
    setPreferenceState(readThemePreference());
    setSystemDark(media.matches);
    setReady(true);
    const onChange = () => setSystemDark(media.matches);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null)
        setPreferenceState(parseThemePreference(event.newValue));
    };
    media.addEventListener("change", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    const background = colorScheme === "dark" ? "#101c2a" : "#f6f0e6";
    root.classList.toggle("dark", colorScheme === "dark");
    root.style.colorScheme = colorScheme;
    root.style.backgroundColor = background;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = background;
    if (Capacitor.isNativePlatform()) {
      void StatusBar.setBackgroundColor({ color: background }).catch((error: unknown) =>
        console.warn("Could not update status bar background", error),
      );
      void StatusBar.setStyle({ style: colorScheme === "dark" ? Style.Light : Style.Dark }).catch(
        (error: unknown) => console.warn("Could not update status bar appearance", error),
      );
    }
  }, [colorScheme, ready]);
  const setPreference = (next: ThemePreference) => {
    saveThemePreference(next);
    setPreferenceState(next);
  };
  return (
    <ThemeContext.Provider value={{ preference, colorScheme, ready, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme requires ThemeProvider");
  return value;
}
