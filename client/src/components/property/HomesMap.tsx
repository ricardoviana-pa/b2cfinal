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
import { useTranslation } from 'react-i18next';
import { formatEur, formatStayEur } from '@/lib/format';
import type { Property } from '@/lib/types';
import type { SearchQuote } from '@/lib/homeSearch';
import { isPartnerHome } from '@shared/partnerHome';

interface HomesMapProps {
  properties: Property[];
  fromPrices?: Record<string, number | null>;
  quotes: Record<string, SearchQuote | null>;
  checkin?: string;
  checkout?: string;
  guests?: number;
  lang: string;
  /** Wrapper classes; replaces the default banner height (e.g. to fill a sticky column). */
  className?: string;
}

export default function HomesMap({ properties, fromPrices, quotes, checkin, checkout, guests, lang, className }: HomesMapProps) {
  const { t } = useTranslation();
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

      const map = mapRef.current;
      const layer = map._pinLayer;
      type Pin = { pos: [number, number]; label: string; note: string; title: string; href: string };
      const pins: Pin[] = [];
      for (const p of properties) {
        const lat = (p as any).address?.lat;
        const lng = (p as any).address?.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        const pos: [number, number] = [Number(lat.toFixed(3)), Number(lng.toFixed(3))];
        const hasDates = !!checkin && !!checkout && checkout > checkin;
        const quote = quotes[p.slug];
        const price = hasDates
          ? (quote?.available !== false ? quote?.total : null)
          : fromPrices?.[p.guestyId ?? p.supplierUid ?? ''];
        const isPartner = isPartnerHome(p);
        const partial = isPartner && hasDates && !quote?.feesKnown;
        const money = price && price > 0
          // Com datas é um total: euros inteiros, como nos cartões (lib/format.ts,
          // decisão E07 de 20 nov 2026). Sem datas é o "desde" por noite.
          ? (hasDates ? formatStayEur(price, lang) : formatEur(price, lang))
          : null;
        const label = money
          ? hasDates ? `${money} ${t(partial ? 'partnerBooking.accommodationLabel' : 'property.totalLabel')}` : `${t('common.from')} ${money}`
          : '·';
        const priceNote = isPartner && money && (!hasDates || partial) ? t('partnerBooking.feesPendingShort') : '';
        const params = new URLSearchParams();
        if (hasDates) { params.set('checkin', checkin!); params.set('checkout', checkout!); }
        if (guests && guests > 1) params.set('guests', String(guests));
        pins.push({
          pos, label, note: priceNote,
          title: `${p.name}: ${money ? label : t('property.priceOnRequest')}. ${priceNote}`,
          href: `/homes/${p.slug}${params.size ? `?${params}` : ''}`,
        });
      }

      /* Homes that would print their labels on top of one another at this zoom
         share one circle with their number; a click moves in until they come
         apart (auditoria de design, 14 nov 2026: no Minho os preços ficavam uns
         por cima dos outros). Redrawn on every zoom. At the closest zoom, homes
         at the same rounded position are stacked one above the other. */
      const draw = () => {
        layer.clearLayers();
        const closest = map.getZoom() >= (map.getMaxZoom() ?? 17);
        const groups: Array<{ x: number; y: number; pins: Pin[] }> = [];
        for (const pin of pins) {
          const pt = map.latLngToLayerPoint(pin.pos);
          const near = groups.find((g) => Math.abs(g.x - pt.x) < 84 && Math.abs(g.y - pt.y) < 30);
          if (near) {
            near.pins.push(pin);
            near.x += (pt.x - near.x) / near.pins.length;
            near.y += (pt.y - near.y) / near.pins.length;
          } else groups.push({ x: pt.x, y: pt.y, pins: [pin] });
        }
        for (const group of groups) {
          if (group.pins.length > 1 && !closest) {
            const el = document.createElement('span');
            el.className = 'pa-map-cluster';
            el.textContent = String(group.pins.length);
            const marker = L.marker(map.layerPointToLatLng([group.x, group.y]), {
              icon: L.divIcon({ className: 'pa-map-pin', html: el, iconSize: null }),
              title: t('listingRail.homes', { count: group.pins.length }),
            });
            marker.on('click', () => map.fitBounds(group.pins.map((g) => g.pos), { padding: [70, 70], maxZoom: Math.min(map.getZoom() + 3, map.getMaxZoom() ?? 17) }));
            layer.addLayer(marker);
            continue;
          }
          group.pins.forEach((pin, i) => {
            const el = document.createElement('span');
            el.className = 'pa-map-pin-label';
            el.textContent = pin.label;
            el.title = pin.note;
            if (i > 0) el.style.transform = `translate(-50%, calc(-100% - ${i * 26}px))`;
            const marker = L.marker(pin.pos, { icon: L.divIcon({ className: 'pa-map-pin', html: el, iconSize: null }), title: pin.title });
            marker.on('click', () => navigateRef.current(pin.href));
            layer.addLayer(marker);
          });
        }
      };
      if (map._redraw) map.off('zoomend', map._redraw);
      map._redraw = draw;
      map.on('zoomend', draw);

      if (pins.length) {
        map.fitBounds(pins.map((pin) => pin.pos), { padding: [36, 36], maxZoom: 11, animate: false });
      } else {
        map.setView([39.6, -8.6], 6); // Portugal
      }
      draw();
    })();
    return () => { cancelled = true; };
  }, [properties, fromPrices, quotes, checkin, checkout, guests, lang, t]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return (
    <div className={className ?? 'mb-8'}>
      <div
        ref={containerRef}
        className={`pa-homes-map ${className ? 'h-full' : 'h-[340px] lg:h-[420px]'} rounded-xl overflow-hidden border border-[#E8E4DC] z-0`}
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
        .pa-map-pin-label:hover { background: #806A48; }
        .pa-map-cluster {
          display: inline-flex; align-items: center; justify-content: center;
          transform: translate(-50%, -50%); min-width: 36px; height: 36px; padding: 0 8px;
          background: #1A1A18; color: #fff; font-size: 13px; font-weight: 500;
          border-radius: 999px; border: 2px solid #FAFAF7;
          box-shadow: 0 2px 8px rgba(0,0,0,.25); cursor: pointer;
        }
        .pa-map-cluster:hover { background: #806A48; }
        .leaflet-container { font-family: inherit; }
        /* The road map's own colours (green parks, blue motorways, orange
           roads) competed with the price labels: the tiles go to warm
           neutrals and the homes stay the only strong marks on the map
           (auditoria de design, 14 nov 2026). The tiles are the same. */
        .pa-homes-map .leaflet-tile-pane { filter: grayscale(1) sepia(.16) contrast(.9) brightness(1.06); }
      `}</style>
    </div>
  );
}
