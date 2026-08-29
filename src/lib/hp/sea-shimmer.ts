/**
 * Decorative sea-shimmer geometry.
 *
 * A hand-drawn, low-vertex outline of the Ionian Sea west of the Ilia coast,
 * stretching from a little offshore of the shoreline out to the map's pan
 * bounds. It is PURELY AESTHETIC — it is not derived from real coastline data
 * and carries no meaning about sea state, weather or bathymetry. It only exists
 * so the animated wave pattern in `SocialMap` has a shape to fill at overview
 * zoom.
 *
 * The shoreline trace is biased ~0.01–0.02° offshore on purpose, so the waves
 * never visibly wash over dry land even though the outline is rough.
 */

type LngLat = [number, number];

export interface SeaShimmerMultiPolygon {
  readonly type: "MultiPolygon";
  /** GeoJSON nesting: polygons → rings → positions ([lng, lat]). */
  readonly coordinates: ReadonlyArray<ReadonlyArray<ReadonlyArray<LngLat>>>;
}

/**
 * Single-member MultiPolygon. Exterior ring, roughly north → south down the
 * coast, then back around the western / northern pan bounds
 * (`MAP_PAN_BOUNDS` in `SocialMap.tsx` = [36.2, 19.4]–[38.9, 23.5]).
 */
export const SEA_SHIMMER_GEOJSON: SeaShimmerMultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        // ── Shoreline trace, ~offshore, north → south ──
        [21.27, 38.1], // offshore Kotychi / Lechaina
        [21.11, 37.98],
        [21.06, 37.93], // offshore Cape Kyllini (juts west)
        [21.08, 37.86], // Loutra Kyllinis
        [21.1, 37.78], // Arkoudi / Glyfa
        [21.11, 37.68], // Kourouta / Amaliada coast
        [21.2, 37.66],
        [21.27, 37.635], // offshore Katakolo
        [21.34, 37.6],
        [21.44, 37.52], // offshore Alfeios mouth / Kaiafas
        [21.56, 37.45],
        [21.66, 37.38], // offshore Neda / Kakovatos (south edge of Ilia)
        // ── Around the pan bounds, south → west → north ──
        [21.9, 36.2], // open sea, SW into Kyparissiakos gulf
        [19.4, 36.2], // SW pan-bounds corner
        [19.4, 38.9], // NW pan-bounds corner
        [20.9, 38.9], // north, mouth of the Patraïkos gulf
        [21.27, 38.1], // close ring
      ],
    ],
  ],
};

/**
 * Leaflet wants `[lat, lng]` and its own multi-polygon nesting
 * (polygons → rings → points). Flip each GeoJSON position and keep the nesting.
 */
export const SEA_SHIMMER_LATLNGS: [number, number][][][] = SEA_SHIMMER_GEOJSON.coordinates.map(
  (polygon) => polygon.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number])),
);

/** Above this zoom the outline is too crude to show and the sea is off-frame anyway. */
export const SEA_SHIMMER_MAX_ZOOM = 12;
