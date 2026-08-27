export type Lang = "GR" | "EN";

export function tr<T>(lang: Lang, entry: { GR: T; EN: T }): T {
  return entry[lang];
}
