import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;

const ILIA_CENTER: [number, number] = [37.68, 21.52];

export function AdminMapPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const initialPositionRef = useRef<[number, number]>([lat, lng]);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    const [initialLat, initialLng] = initialPositionRef.current;
    import("leaflet").then((L) => {
      if (cancelled || !nodeRef.current || mapRef.current) return;
      const map = L.map(nodeRef.current, { zoomControl: true, scrollWheelZoom: true }).setView(
        Number.isFinite(initialLat) ? [initialLat, initialLng] : ILIA_CENTER,
        Number.isFinite(initialLat) ? 13 : 9,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker(
        Number.isFinite(initialLat) ? [initialLat, initialLng] : ILIA_CENTER,
        {
          draggable: true,
        },
      ).addTo(map);
      const reportPosition = () => {
        const position = marker.getLatLng();
        onChangeRef.current(position.lat, position.lng);
      };
      marker.on("dragend", reportPosition);
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        marker.setLatLng(event.latlng);
        reportPosition();
      });
      mapRef.current = map;
      markerRef.current = marker;
      window.setTimeout(() => map.invalidateSize(), 0);
    });
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const next: [number, number] = [lat, lng];
    markerRef.current?.setLatLng(next);
  }, [lat, lng]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div
        ref={nodeRef}
        className="h-64 w-full"
        aria-label="Choose the place position on the map"
      />
      <p className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        Click the map or drag the pin to set the exact location.
      </p>
    </div>
  );
}
