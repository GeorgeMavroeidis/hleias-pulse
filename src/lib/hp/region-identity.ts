import type { PlaceType } from "../hp-model";
import type { AreaTone } from "./area-catalog";

export type RegionIdentity =
  | "coastal"
  | "urban"
  | "harbour"
  | "heritage"
  | "forest"
  | "nature"
  | "village"
  | "local";
export type RegionIdentityMetadata = { primary: RegionIdentity; secondary?: RegionIdentity };

export const REGION_IDENTITIES: Record<RegionIdentity, { label: string; accent: string }> = {
  coastal: { label: "Coast", accent: "#35657a" },
  urban: { label: "Town", accent: "#575e61" },
  harbour: { label: "Harbour", accent: "#ad6f48" },
  heritage: { label: "Heritage", accent: "#8a7557" },
  forest: { label: "Forest", accent: "#627356" },
  nature: { label: "Nature", accent: "#577773" },
  village: { label: "Village", accent: "#817560" },
  local: { label: "Local places", accent: "#746c61" },
};
const TONE_IDENTITIES: Record<AreaTone, RegionIdentity> = {
  beach: "coastal",
  culture: "heritage",
  local: "local",
  music: "local",
  nature: "nature",
  village: "village",
};
const CATEGORY_IDENTITIES: Record<PlaceType, RegionIdentity> = {
  beach: "coastal",
  sunset: "coastal",
  culture: "heritage",
  nature: "nature",
  village: "village",
  local: "local",
  night: "local",
  food: "local",
};
export const identityForTone = (tone: AreaTone): RegionIdentityMetadata => ({
  primary: TONE_IDENTITIES[tone],
});
export const identityForPlaceCategory = (category: PlaceType): RegionIdentityMetadata => ({
  primary: CATEGORY_IDENTITIES[category],
});

/** Keys, not prose: actual matching catalog categories never imply current attendance. */
export function regionalDescriptorKeys(identity: RegionIdentityMetadata, categories: PlaceType[]) {
  const keys = [
    REGION_IDENTITIES[identity.primary].label,
    ...(identity.secondary ? [REGION_IDENTITIES[identity.secondary].label] : []),
    ...[...new Set(categories)].sort(),
  ];
  const seen = new Set<string>();
  return keys
    .filter((key) => {
      const canonical = key.toLowerCase();
      if (seen.has(canonical)) return false;
      seen.add(canonical);
      return true;
    })
    .slice(0, 3);
}
