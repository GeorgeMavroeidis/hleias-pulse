import type { Place } from "@/lib/hp-model";

export type AreaTone = "beach" | "culture" | "local" | "music" | "nature" | "village";

export type AreaDefinition = {
  id: string;
  name: string;
  title: string;
  tone: AreaTone;
  /** Explicit, geographically-tight membership based on the real map coordinates. */
  placeIds: string[];
};

// Curated from the proximity analysis in scripts/hp-seed-data.ts. Unknown
// places deliberately remain standalone areas instead of being force-fit into
// a distant neighbourhood.
export const AREA_DEFINITIONS: AreaDefinition[] = [
  {
    id: "olympia",
    name: "Ancient Olympia",
    title: "Olympia pulse",
    tone: "culture",
    placeIds: ["ancient-olympia", "olympia-stadium", "olympia-museum", "olympic-games-museum"],
  },
  {
    id: "ancient-elis",
    name: "Ancient Elis",
    title: "Ancient Elis",
    tone: "culture",
    placeIds: ["ancient-elis", "elis-agora"],
  },
  {
    id: "katakolo",
    name: "Katakolo",
    title: "Katakolo sunset",
    tone: "beach",
    placeIds: [
      "katakolo-port",
      "katakolo-sunset",
      "katakolo-kiani-akti",
      "agios-andreas",
      "lechaina-zacharo-flower",
    ],
  },
  {
    id: "skafidia",
    name: "Skafidia",
    title: "Skafidia coast",
    tone: "beach",
    placeIds: ["skafidia", "skafidia-monastery", "korakochori", "mercouri-estate"],
  },
  {
    id: "kourouta",
    name: "Kourouta",
    title: "Kourouta tonight",
    tone: "music",
    placeIds: ["kourouta-beach", "kourouta-sunset", "palouki-beach", "amaliada-square"],
  },
  {
    id: "kyllini",
    name: "Kyllini",
    title: "Kyllini harbor",
    tone: "beach",
    placeIds: ["kyllini-beach", "kyllini-harbor", "kyllini-old-beach"],
  },
  {
    id: "chlemoutsi",
    name: "Chlemoutsi",
    title: "Chlemoutsi & Arkoudi",
    tone: "culture",
    placeIds: ["chlemoutsi", "chlemoutsi-sea-view", "loutra-kyllinis", "arkoudi-beach"],
  },
  {
    id: "pyrgos",
    name: "Pyrgos",
    title: "Pyrgos is moving",
    tone: "local",
    placeIds: ["pyrgos-centre", "pyrgos-night"],
  },
  {
    id: "pineios",
    name: "Pineios",
    title: "Pineios plain",
    tone: "local",
    placeIds: ["vartholomio", "gastouni"],
  },
  {
    id: "zacharo",
    name: "Zacharo",
    title: "Zacharo sunset",
    tone: "beach",
    placeIds: ["zacharo-beach", "kaiafas-lake", "kaiafas-sunset"],
  },
  {
    id: "kakovatos",
    name: "Kakovatos",
    title: "Kakovatos",
    tone: "beach",
    placeIds: ["kakovatos-beach", "kakovatos-inland"],
  },
  {
    id: "south-coast",
    name: "South Coast",
    title: "South Coast pulse",
    tone: "beach",
    placeIds: ["giannitsochori", "tholo-beach"],
  },
  {
    id: "foloi",
    name: "Foloi Forest",
    title: "Foloi tips",
    tone: "nature",
    placeIds: ["foloi-forest", "foloi-deep"],
  },
  {
    id: "nemouta",
    name: "Nemouta",
    title: "Nemouta waterfalls",
    tone: "nature",
    placeIds: ["nemouta-waterfalls", "nemouta-village"],
  },
  {
    id: "andritsaina",
    name: "Andritsaina",
    title: "Andritsaina village",
    tone: "village",
    placeIds: ["andritsaina", "andritsaina-streets"],
  },
  {
    id: "bassae",
    name: "Bassae",
    title: "Temple of Bassae",
    tone: "culture",
    placeIds: ["bassae-temple", "bassae-inside"],
  },
];

const AREA_BY_ID = new Map(AREA_DEFINITIONS.map((area) => [area.id, area]));
const AREA_ID_BY_PLACE = new Map(
  AREA_DEFINITIONS.flatMap((area) => area.placeIds.map((placeId) => [placeId, area.id] as const)),
);

export function areaIdForPlaceId(placeId: string) {
  return AREA_ID_BY_PLACE.get(placeId) ?? `solo-${placeId}`;
}

export function areaIdForPlace(place: Pick<Place, "id">) {
  return areaIdForPlaceId(place.id);
}

export function areaDefinitionForId(areaId: string) {
  return AREA_BY_ID.get(areaId) ?? null;
}

export function toneForPlace(place: Place): AreaTone {
  if (place.type === "beach" || place.type === "sunset") return "beach";
  if (place.type === "culture") return "culture";
  if (place.type === "nature") return "nature";
  if (place.type === "village" || place.type === "night") return "village";
  return "local";
}

export function groupPlacesByArea(places: Place[]) {
  return places.reduce<Map<string, Place[]>>((groups, place) => {
    const areaId = areaIdForPlace(place);
    const current = groups.get(areaId);
    if (current) current.push(place);
    else groups.set(areaId, [place]);
    return groups;
  }, new Map());
}
