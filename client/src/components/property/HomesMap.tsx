/* ==========================================================================
   HomesMap — minimalist PLP map (Leaflet + OSM, loaded only when opened)
   ==========================================================================
   Price-pill markers for the currently filtered homes; click → PDP. Pins use
   the same ~100 m rounding as the PDP map so the exact address stays private.
   Leaflet is imported dynamically so the library never touches the critical
   path — the PLP stays as light as before unless the guest opens the map.
   ========================================================================== */
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { formatEur } from '@/lib/format';
// Minimal shape — the PLP passes its own Property objects.
interface Property {
  guestyId?: string;
  slug: string;
  name: string;
  priceFrom?: number;
  amenities?: Record<string, string[]>;
  propertyType?: string;
}

interface HomesMapProps {
  properties: Property[];
  fromPrices?: Record<string, number>;
  lang: string;
}

export default function HomesMap({ properties, fromPrices, lang }: HomesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [, navigate] = useLocation();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet: any = await import('leaflet' as any);
      await import('leaflet/dist/leaflet.css');
      const L = leaflet.default ?? leaflet;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          scrollWheelZoom: false,
          zoomControl: true,
          attributionControl: true,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 17,
        }).addTo(mapRef.current);
        mapRef.current._pinLayer = L.layerGroup().addTo(mapRef.current);
      }

      const layer = mapRef.current._pinLayer;
      layer.clearLayers();
      const bounds: Array<[number, number]> = [];
      for (const p of properties) {
        const lat = (p as any).address?.lat;
        const lng = (p as any).address?.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        const pos: [number, number] = [Number(lat.toFixed(3)), Number(lng.toFixed(3))];
        bounds.push(pos);
        const nightly = fromPrices?.[p.guestyId ?? ''] ?? p.priceFrom ?? 0;
        const label = nightly > 0 ? formatEur(nightly, lang) : '·';
        const icon = L.divIcon({
          className: 'pa-map-pin',
          html: `<span class="pa-map-pin-label">${label}</span>`,
          iconSize: null,
        });
        const marker = L.marker(pos, { icon, title: p.name });
        marker.on('click', () => navigateRef.current(`/homes/${p.slug}`));
        layer.addLayer(marker);
      }
      if (bounds.length) {
        mapRef.current.fitBounds(bounds, { padding: [36, 36], maxZoom: 11 });
      } else {
        mapRef.current.setView([39.6, -8.6], 6); // Portugal
      }
    })();
    return () => { cancelled = true; };
  }, [properties, fromPrices, lang]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return (
    <div className="mb-8">
      <div
        ref={containerRef}
        className="h-[340px] lg:h-[420px] rounded-xl overflow-hidden border border-[#E8E4DC] z-0"
        role="region"
        aria-label="Map of homes"
      />
      <style>{`
        .pa-map-pin { background: none; border: none; }
        .pa-map-pin-label {
          display: inline-block; transform: translate(-50%, -100%);
          background: #1A1A18; color: #fff; font-size: 12px; font-weight: 500;
          padding: 3px 9px; border-radius: 999px; white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0,0,0,.25); cursor: pointer;
        }
        .pa-map-pin-label:hover { background: #8B7355; }
        .leaflet-container { font-family: inherit; }
      `}</style>
    </div>
  );
}
