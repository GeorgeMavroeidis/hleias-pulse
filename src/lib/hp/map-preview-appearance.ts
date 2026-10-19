import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { MapCartographyPalette } from "./map-cartography";
import { IONIAN_LAND_POLYGONS } from "./ionian-land";

export type PreviewLandLayer = {
  update: (palette: Readonly<MapCartographyPalette>, duration: number) => void;
  dispose: () => void;
};

/** Preview has no worker-backed tile or GeoJSON source, even during appearance changes. */
export function createLocalPreviewBasemapStyle(
  palette: Readonly<MapCartographyPalette>,
): StyleSpecification {
  return {
    version: 8,
    name: "Ilia local preview",
    sources: {},
    layers: [
      {
        id: "hp-preview-sea",
        type: "background",
        paint: { "background-color": palette.water },
      },
    ],
  };
}

/** Bundled coast paths stay above the preview canvas and reuse MapLibre projection. */
export function attachLocalPreviewLand(
  map: MapLibreMap,
  palette: Readonly<MapCartographyPalette>,
): PreviewLandLayer {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.inset = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.zIndex = "1";
  svg.style.pointerEvents = "none";
  const paths = IONIAN_LAND_POLYGONS.map(() => {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("stroke-width", "1.2");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("fill-rule", "evenodd");
    svg.append(path);
    return path;
  });
  let disposed = false;
  const update = (next: Readonly<MapCartographyPalette>, duration: number) => {
    if (disposed) return;
    for (const path of paths) {
      path.style.transition =
        duration > 0 ? `fill ${duration}ms ease, stroke ${duration}ms ease` : "none";
      path.setAttribute("fill", next.land);
      path.setAttribute("stroke", next.olive);
    }
  };
  update(palette, 0);
  map.getCanvasContainer().append(svg);

  let frame: number | null = null;
  const draw = () => {
    frame = null;
    if (disposed) return;
    const width = map.getContainer().clientWidth;
    const height = map.getContainer().clientHeight;
    if (width <= 0 || height <= 0) return;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    IONIAN_LAND_POLYGONS.forEach((polygon, index) => {
      const d = polygon
        .map(
          (ring) =>
            ring
              .map(([lng, lat], pointIndex) => {
                const point = map.project([lng, lat]);
                return `${pointIndex === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
              })
              .join(" ") + " Z",
        )
        .join(" ");
      paths[index].setAttribute("d", d);
    });
  };
  const scheduleDraw = () => {
    if (disposed || frame !== null) return;
    frame = window.requestAnimationFrame(draw);
  };
  map.on("move", scheduleDraw);
  map.on("resize", scheduleDraw);
  scheduleDraw();
  return {
    update,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      map.off("move", scheduleDraw);
      map.off("resize", scheduleDraw);
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      svg.remove();
    },
  };
}

/** The SocialMap appearance owner calls this only for its source-free preview session. */
export function applyPreviewMapPalette(
  map: Pick<MapLibreMap, "getLayer" | "setPaintProperty">,
  land: PreviewLandLayer,
  palette: Readonly<MapCartographyPalette>,
  duration: number,
): void {
  if (map.getLayer("hp-preview-sea")) {
    map.setPaintProperty("hp-preview-sea", "background-color-transition", { duration, delay: 0 });
    map.setPaintProperty("hp-preview-sea", "background-color", palette.water);
  }
  land.update(palette, duration);
}
