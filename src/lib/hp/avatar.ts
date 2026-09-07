/**
 * Fallback avatar for a real account that hasn't uploaded a photo yet.
 *
 * Previously this fell back to a random i.pravatar.cc stock photo — a real
 * stranger's face assigned to whichever local or tourist happened not to have
 * a profile picture. That's the wrong kind of "looks real": it invents an
 * identity that doesn't exist. An initials avatar (like WhatsApp/Gmail) is
 * honest about there being no photo, and costs nothing.
 *
 * Returned as a `data:` URI so it drops straight into any existing
 * `avatarUrl: string` field or `<img src>` — no component changes needed at
 * the call sites.
 */

// Pulled straight from the app's own palette (src/styles/theme.css --hp-*),
// so a generated avatar never looks like it's from a different design system.
const AVATAR_PALETTE = [
  "#7fc8de", // hp-sea
  "#0e3a5b", // hp-deep
  "#667a3d", // hp-olive
  "#e06a32", // hp-sunset
  "#241b3d", // hp-night
  "#7a4dd8", // hp-purple
];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** "Theodoros Papas" -> "TP", "Nikos" -> "NI", "" -> "?" */
export function initialsFromName(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A deterministic "no photo yet" avatar: initials on a color drawn from the
 * app's palette. `colorSeed` (defaults to `name`) picks the color, so e.g.
 * every avatar for the same person is always the same color even if the
 * displayed name varies slightly.
 */
export function initialsAvatarDataUri(name: string, colorSeed: string = name): string {
  const initials = initialsFromName(name);
  const color = AVATAR_PALETTE[hashSeed(colorSeed || name || "?") % AVATAR_PALETTE.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
    `<rect width="120" height="120" rx="60" fill="${color}"/>` +
    `<text x="60" y="64" text-anchor="middle" font-family="IBM Plex Sans, ui-sans-serif, system-ui, sans-serif" font-size="46" font-weight="700" fill="#fff8ec">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
