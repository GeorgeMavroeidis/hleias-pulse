export type MarkerMotion = "pulse" | "calm";
export const MARKER_MOTION_STORAGE_KEY = "hp.marker-motion.v1";
export const LEGACY_MARKER_THEME_STORAGE_KEY = "hp.marker-animation-theme.v1";
type PreferenceStorage = { getItem(key: string): string | null };

export function readMarkerMotionPreference(storage?: PreferenceStorage): MarkerMotion {
  try {
    const saved = storage?.getItem(MARKER_MOTION_STORAGE_KEY);
    if (saved === "pulse" || saved === "calm") return saved;
    return storage?.getItem(LEGACY_MARKER_THEME_STORAGE_KEY) === "calm" ? "calm" : "pulse";
  } catch {
    return "pulse";
  }
}
