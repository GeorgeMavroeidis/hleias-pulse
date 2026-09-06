import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { useI18n } from "@/lib/i18n";

type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;
type LeafletLayerGroup = import("leaflet").LayerGroup;

const ILIA_CENTER: [number, number] = [37.68, 21.52];

// Pin colour per place type, so the overview map reads as a legend without one.
const TYPE_COLOR: Record<string, string> = {
  beach: "#0ea5e9",
  culture: "#8b5cf6",
  food: "#f97316",
  local: "#ef4444",
  nature: "#16a34a",
  night: "#1e293b",
  sunset: "#f59e0b",
  village: "#0f766e",
};

export const PLACE_TYPE_COLOR = TYPE_COLOR;

export type MapPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  moderation_status: string;
};

export function AdminPlacesMap({
  places,
  selectedId,
  draftLat,
  draftLng,
  onSelectPlace,
  onMoveDraft,
}: {
  places: MapPlace[];
  selectedId: string | null;
  draftLat: number;
  draftLng: number;
  onSelectPlace: (id: string) => void;
  onMoveDraft: (lat: number, lng: number) => void;
}) {
  const { t } = useI18n();
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const pinsRef = useRef<LeafletLayerGroup | null>(null);
  const draftRef = useRef<LeafletMarker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  // Leaflet is imported lazily, so the draw effect below would otherwise run once
  // against null refs and never again. This flag re-runs it the moment the map exists.
  const [mapReady, setMapReady] = useState(false);

  // Handlers change identity on every render; keep them in refs so the map is
  // built exactly once and never torn down mid-edit.
  const onSelectRef = useRef(onSelectPlace);
  const onMoveRef = useRef(onMoveDraft);
  onSelectRef.current = onSelectPlace;
  onMoveRef.current = onMoveDraft;

  const initialRef = useRef<[number, number]>([draftLat, draftLng]);
  const didFitRef = useRef(false);
  const fitPendingRef = useRef<Array<[number, number]> | null>(null);

  // The map is built before the browser has laid the panel out, so at first draw
  // the container measures 0px wide and getBoundsZoom collapses to world zoom —
  // which looks exactly like "the pins are missing". Hold the wanted bounds and
  // apply them from the ResizeObserver below, once the container has real width.
  const runFit = useCallback(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const points = fitPendingRef.current;
    if (!L || !map || !points || didFitRef.current) return;
    if (map.getSize().x < 40) return;
    didFitRef.current = true;
    fitPendingRef.current = null;
    map.fitBounds(L.latLngBounds(points).pad(0.15), { animate: false });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const [initialLat, initialLng] = initialRef.current;
    void import("leaflet").then((L) => {
      if (cancelled || !nodeRef.current || mapRef.current) return;
      const hasStart = Number.isFinite(initialLat) && Number.isFinite(initialLng);
      const map = L.map(nodeRef.current, { zoomControl: true, scrollWheelZoom: true }).setView(
        hasStart ? [initialLat, initialLng] : ILIA_CENTER,
        hasStart ? 12 : 9,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      // A divIcon rather than Leaflet's default marker: the default pulls two PNGs
      // by relative URL, which is exactly the kind of thing that silently 404s
      // under a bundler and leaves an invisible pin.
      const draftIcon = L.divIcon({
        className: "",
        html: '<span style="display:block;width:20px;height:20px;border-radius:9999px;background:#ea580c;border:3px solid #fff;box-shadow:0 0 0 2px rgba(15,23,42,.45),0 2px 6px rgba(0,0,0,.35)"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const draft = L.marker(hasStart ? [initialLat, initialLng] : ILIA_CENTER, {
        draggable: true,
        icon: draftIcon,
        zIndexOffset: 1000,
      }).addTo(map);
      draft.on("dragend", () => {
        const position = draft.getLatLng();
        onMoveRef.current(position.lat, position.lng);
      });
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        draft.setLatLng(event.latlng);
        onMoveRef.current(event.latlng.lat, event.latlng.lng);
      });

      leafletRef.current = L;
      mapRef.current = map;
      draftRef.current = draft;
      pinsRef.current = L.layerGroup().addTo(map);
      window.setTimeout(() => map.invalidateSize(), 0);
      setMapReady(true);
    });
    return () => {
      cancelled = true;
      pinsRef.current?.remove();
      pinsRef.current = null;
      draftRef.current?.remove();
      draftRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      didFitRef.current = false;
      fitPendingRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Redraw every existing pin whenever the set, the selection, or the map changes.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const pins = pinsRef.current;
    if (!mapReady || !L || !map || !pins) return;
    pins.clearLayers();

    const points: Array<[number, number]> = [];
    for (const place of places) {
      if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
      points.push([place.lat, place.lng]);
      const isSelected = place.id === selectedId;
      const marker = L.circleMarker([place.lat, place.lng], {
        radius: isSelected ? 11 : 7,
        color: isSelected ? "#0f172a" : "#ffffff",
        weight: isSelected ? 3 : 2,
        fillColor: TYPE_COLOR[place.type] ?? "#64748b",
        fillOpacity: place.moderation_status === "published" ? 0.95 : 0.4,
      });
      marker.bindTooltip(place.name, { direction: "top", offset: [0, -6] });
      marker.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event);
        onSelectRef.current(place.id);
      });
      marker.addTo(pins);
    }

    // Frame the whole region once, on the first draw that actually has places.
    if (!didFitRef.current && points.length > 1) {
      fitPendingRef.current = points;
      runFit();
    }
  }, [places, selectedId, mapReady, runFit]);

  // Keep Leaflet's cached size honest, and take the first real width as the cue
  // to frame the region.
  useEffect(() => {
    const node = nodeRef.current;
    if (!mapReady || !node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
      runFit();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [mapReady, runFit]);

  // Follow the draft pin when the coordinates are typed into the number fields.
  useEffect(() => {
    if (!Number.isFinite(draftLat) || !Number.isFinite(draftLng)) return;
    draftRef.current?.setLatLng([draftLat, draftLng]);
  }, [draftLat, draftLng, mapReady]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      <div
        ref={nodeRef}
        className="h-[420px] w-full xl:h-[560px]"
        aria-label={t("Choose the place position on the map")}
      />
      <p className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        {t("Click a pin to open it, or click the map to move the selected place.")}
      </p>
    </div>
  );
}
