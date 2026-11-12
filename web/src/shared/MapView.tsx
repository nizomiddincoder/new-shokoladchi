import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER: [number, number] = [41.311081, 69.240562]; // Toshkent

const pinIcon = L.divIcon({ className: '', html: '<div class="map-pin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });

export function MapView({
  lat,
  lng,
  height = 180,
  onPick,
  zoom = 16,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  height?: number;
  onPick?: (lat: number, lng: number) => void;
  zoom?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const hasPoint = lat != null && lng != null;
    const map = L.map(ref.current, {
      center: hasPoint ? [lat!, lng!] : DEFAULT_CENTER,
      zoom: hasPoint ? zoom : 12,
      zoomControl: false,
      attributionControl: true,
      dragging: true,
      scrollWheelZoom: !!onPick,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    if (onPick) {
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      map.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.(e.latlng.lat, e.latlng.lng));
    }
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat == null || lng == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) markerRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
    else markerRef.current.setLatLng([lat, lng]);
    map.setView([lat, lng], Math.max(map.getZoom(), zoom - 1));
  }, [lat, lng]);

  return <div ref={ref} style={{ height }} className="w-full overflow-hidden rounded-[14px] border border-line" />;
}
