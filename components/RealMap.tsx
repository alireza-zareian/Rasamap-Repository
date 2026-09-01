"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";

export interface MapFocus { lat: number; lng: number; zoom: number; }

/** Slim billboard shape used by the map — all geocoded, non-pending billboards. */
export interface MapPin {
  id: number;
  name: string;
  slug: string;
  lat?: number | null;
  lng?: number | null;
  status: string;
  icon: string;
  city: string;
  region: string;
  price: number;
  width: number;
  height: number;
  estimatedViews: number;
}

interface Props {
  billboards: MapPin[];
  selectedId: number | null;
  compareIds: number[];
  onSelect: (b: MapPin) => void;
  onOpenDetails: (b: MapPin) => void;
  flyTo?: MapFocus | null;
}

// Hardcoded real coordinates for the original demo listings
const COORDS: Record<number, [number, number]> = {
  1: [35.7219, 51.3347],
  2: [35.7578, 51.4073],
  3: [35.7712, 51.4285],
  4: [35.7050, 51.3512],
  5: [35.8037, 51.4312],
  6: [35.7611, 51.4102],
  7: [35.7167, 51.2890],
  8: [35.7320, 51.4780],
  9: [35.7556, 51.4055],
  10: [35.7790, 51.4120],
  11: [35.6998, 51.3371],
  12: [35.7098, 51.4102],
  20: [36.6764, 48.4963],
  21: [36.6840, 48.5030],
  22: [36.6400, 48.4700],
  23: [32.6546, 51.6680],
  24: [32.6572, 51.6776],
};

// CARTO — fast global CDN, Persian labels from OSM, no embedded tile watermark.
const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_URL   = TILE_DARK; // alias used in init
const TILE_ATTR  = '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>';

// Shared tile layer options — tuned for correctness at ALL zoom levels,
// including country-level (z4-z6) where blank-tile glitches are worst.
//
// Key changes from the previous version:
//
// updateWhenIdle:false — the previous `true` setting meant Leaflet only
//   requested new tiles after ALL motion had fully stopped. At country-
//   level this is catastrophic: a single slow pan keeps the map blank
//   for the entire gesture duration. With `false`, Leaflet issues tile
//   requests as soon as the pan/zoom animation settles each step, so
//   tiles stream in progressively and blank areas vanish.
//
// updateWhenZooming:false — stays false. We still don't want a flood of
//   requests on every animation frame. The combination of
//   updateWhenZooming:false + updateWhenIdle:false gives "request tiles
//   once per zoom/pan step, but don't wait for full motion stop."
//
// keepBuffer:3 at country-level the viewport covers a huge geographic
//   area and panning reveals empty edges quickly. Buffer=3 pre-fetches
//   enough off-screen tiles to cover typical pan distances without the
//   user ever seeing a blank edge.
//
// detectRetina:true — requests @2x tiles on HiDPI screens, halving the
//   number of tiles needed to fill the viewport and reducing blank area.
const TILE_OPTIONS = {
  attribution: TILE_ATTR,
  subdomains: "abcd",
  maxZoom: 19,
  updateWhenIdle: false,   // request tiles per pan/zoom step, not only at full stop
  updateWhenZooming: false, // don't flood requests on every animation frame
  keepBuffer: 3,           // pre-fetch off-screen tiles to avoid blank edges
  detectRetina: true,      // halves tile count on HiDPI screens
};

// leaflet.markercluster CDN (loaded at runtime, with timeout fallback)
const CLUSTER_CSS1 = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";
const CLUSTER_CSS2 = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css";
const CLUSTER_JS = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";

// ── Coord resolution ─────────────────────────────────────────────
// No random/jittered fallback: if a billboard has no real lat/lng
// (and no manual override in COORDS), it simply isn't placed on the
// map. This is intentional — a fake "near the city center" point looks
// like real data and hides which billboards still need geocoding.
// Run `npm run db:backfill-coords` to fill these in for real.
function resolveCoords(b: MapPin): [number, number] | null {
  if (typeof b.lat === "number" && typeof b.lng === "number") return [b.lat, b.lng];
  const manual = COORDS[b.id];
  if (manual) return manual;
  return null;
}

// ── Icon cache ────────────────────────────────────────────────────
// Module-level cache: same color+scale+icon char always reuses the
// same L.divIcon object — avoids thousands of re-creations on re-render.
const iconCache = new Map<string, any>();

function buildIcon(L: any, color: string, scale: number, iconChar: string): any {
  const key = `${color}|${scale}|${iconChar}`;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const size = Math.round(38 * scale);
  const half = Math.round(19 * scale);
  const isSelected = scale > 1;
  const icon = L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:2px solid rgba(255,255,255,${isSelected ? 0.5 : 0.2});
      box-shadow:0 4px 14px ${color}66${isSelected ? `,0 0 0 6px ${color}33` : ""};
      display:flex;align-items:center;justify-content:center;cursor:pointer;
    "><span style="transform:rotate(45deg);font-size:${isSelected ? 1.1 : 0.9}rem">${iconChar}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [half, size],
    popupAnchor: [0, -Math.round(42 * scale)],
  });
  iconCache.set(key, icon);
  return icon;
}

function markerColor(b: MapPin, selectedId: number | null, compareIds: number[]): string {
  if (selectedId === b.id) return "#FFB300";
  if (compareIds.includes(b.id)) return "#9333EA";
  return b.status === "available" ? "#FF4D00" : "#EF4444";
}

// ── CDN resource loader ───────────────────────────────────────────
// Injects a <link> or <script> tag exactly once.
// Already-present tags resolve immediately.
function injectResource(type: "link" | "script", url: string): Promise<void> {
  const selector = type === "link" ? `link[href="${url}"]` : `script[src="${url}"]`;
  if (document.querySelector(selector)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (type === "link") {
      const el = document.createElement("link");
      el.rel = "stylesheet"; el.href = url;
      el.onload = () => resolve(); el.onerror = reject;
      document.head.appendChild(el);
    } else {
      const el = document.createElement("script");
      // async:false keeps execution order — JS must run after CSS is parsed
      el.src = url; el.async = false;
      el.onload = () => resolve(); el.onerror = reject;
      document.head.appendChild(el);
    }
  });
}

// Races each resource injection against a 5-second timeout.
// If the CDN is slow or blocked (common in Iran), the promise resolves
// instead of hanging forever. The caller checks `clusterAvailable` and
// falls back to plain marker mode so the map always loads.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">(r => setTimeout(() => r("timeout"), ms))]);
}

async function loadCluster(_timeoutMs = 5000): Promise<boolean> {
  try {
    // Load from local npm package — no CDN, no network, always available.
    const [L] = await Promise.all([
      import("leaflet"),
      import("leaflet.markercluster/dist/MarkerCluster.css" as any),
      import("leaflet.markercluster/dist/MarkerCluster.Default.css" as any),
      import("leaflet.markercluster"),
    ]);
    // The plugin attaches itself to L.markerClusterGroup
    if (typeof (L as any).markerClusterGroup !== "function") {
      console.warn("[RealMap] markerClusterGroup not found after local import");
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[RealMap] cluster load error:", e, "— map will load without clustering");
    return false;
  }
}

// ── Cluster icon factory (used when clustering is available) ──────
function makeClusterIcon(L: any, count: number): any {
  const size = count > 100 ? 52 : count > 10 ? 44 : 36;
  return (L as any).divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;
      background:linear-gradient(135deg,#FF4D00,#FF8C00);
      border-radius:50%;
      border:3px solid rgba(255,255,255,0.3);
      box-shadow:0 4px 14px rgba(255,77,0,0.5);
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:${count > 99 ? "0.65" : "0.75"}rem;
      color:#fff;font-family:Vazirmatn,sans-serif;
    ">${count}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ── Component ─────────────────────────────────────────────────────
export default function RealMap({
  billboards, selectedId, compareIds, onSelect, onOpenDetails, flyTo,
}: Props) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);   // MarkerClusterGroup | null (null = no clustering)
  const markersRef = useRef<Map<number, any>>(new Map());
  const pendingFlyToRef = useRef<MapFocus | null | undefined>(flyTo);
  const clusterAvailableRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [clusterEpoch, setClusterEpoch] = useState(0);

  // Keep pending flyTo up to date for when the map finishes init
  useEffect(() => { pendingFlyToRef.current = flyTo; }, [flyTo]);

  // Swap tile layer when theme changes (only after map is ready).
  // We add the new layer first and remove the old one only after the
  // new layer fires its first 'load' event — this eliminates the
  // flash-of-blank that occurred when the old layer was torn down
  // while its replacement tiles were still in flight.
  useEffect(() => {
    const map = leafletRef.current;
    if (!map) return;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    import("leaflet").then((L) => {
      if (!leafletRef.current) return;
      const oldTile = tileRef.current;
      const newTile = L.tileLayer(dark ? TILE_DARK : TILE_LIGHT, TILE_OPTIONS);
      tileRef.current = newTile;
      newTile.addTo(leafletRef.current);

      // Wire up the retry handler for the new tile layer too.
      const retryCounts = new Map<string, number>();
      newTile.on("tileerror", (evt: any) => {
        if (tileRef.current !== newTile) return;
        const url: string = evt.tile?.src ?? "";
        if (!url) return;
        const attempts = retryCounts.get(url) ?? 0;
        if (attempts >= 2) return;
        retryCounts.set(url, attempts + 1);
        const delay = attempts === 0 ? 1500 : 4000;
        setTimeout(() => {
          if (tileRef.current !== newTile) return;
          if (evt.tile && leafletRef.current) {
            evt.tile.src = url.includes("?") ? `${url}&_r=${attempts}` : `${url}?_r=${attempts}`;
          }
        }, delay);
      });

      // Remove the old layer only after the first batch of new tiles
      // has loaded, so there's no blank-canvas window between them.
      if (oldTile) {
        const cleanup = () => {
          if (leafletRef.current) leafletRef.current.removeLayer(oldTile);
          newTile.off("load", cleanup);
          if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
        };
        newTile.once("load", cleanup);
        // Safety net: if 'load' never fires (e.g. offline), remove after 3s.
        fallbackTimer = setTimeout(() => {
          if (leafletRef.current) leafletRef.current.removeLayer(oldTile);
          fallbackTimer = null;
        }, 3000);
      }
    });

    return () => {
      // If the effect re-runs (e.g. rapid theme toggle) before the
      // fallback fires, cancel it to avoid removing the wrong layer.
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    };
  }, [dark]);

  // ── Map initialization ────────────────────────────────────────
  // Runs exactly once. The map + tiles are created from the local
  // Leaflet import only; marker-cluster (a CDN plugin) loads separately
  // in the background afterward and never gates the initial paint.
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    // Track whether this effect's cleanup ran before the async work finished.
    // If true, we must not touch any refs or the DOM.
    let destroyed = false;

    (async () => {
      // Load Leaflet itself first. This is a local bundled module, not a
      // network fetch, so it resolves instantly regardless of connectivity.
      // The map + tile layer are created from this alone — they must NEVER
      // wait on the (optional) marker-cluster CDN plugin below, which can
      // be slow or blocked entirely (common in Iran). Previously both were
      // awaited together via Promise.all, so a slow/blocked cluster CDN
      // silently delayed the map — and its tiles — by up to 5s even though
      // markers (plain colored divs, no network needed) would pop in
      // instantly the moment the map finally did appear.
      const L = await import("leaflet");

      // Component unmounted while we were loading — abort completely.
      if (destroyed || !mapRef.current) return;

      // Also bail out if another effect run already init'd the map
      if (leafletRef.current) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const focus = pendingFlyToRef.current;
      const map = L.map(mapRef.current, {
        center: focus ? [focus.lat, focus.lng] : [35.745, 51.375],
        zoom: focus ? focus.zoom : 12,
        zoomControl: false,
        // Prevents the map from rendering blank world-copy columns when
        // zoomed out to country-level (z4-z6). Without this, Leaflet can
        // show a repeated ghost copy of the world at the edge of the
        // viewport, which appears as blank stripes.
        worldCopyJump: true,
        // Ensures Leaflet re-measures the container dimensions after init.
        // Without this, if the host flexbox hasn't finished layout when
        // the map initialises, the map thinks it's smaller than it is and
        // leaves blank strips around the edge.
        preferCanvas: true,   // Canvas renderer is faster for 100+ markers
      });

      if (destroyed) { map.remove(); return; } // unmounted during L.map() sync work

      leafletRef.current = map;

      const tile = L.tileLayer(dark ? TILE_DARK : TILE_LIGHT, TILE_OPTIONS);
      tileRef.current = tile;
      tile.addTo(map);

      // On rapid zoom (e.g. scroll-wheel spin), Leaflet fires several zoom
      // levels in quick succession. We record the zoom level at the START
      // of the gesture and use it in zoomend to detect multi-step skips.
      // We intentionally do NOT cancel in-flight tile <img> requests here:
      // the previous approach set el.src="" which permanently blanked tiles
      // because Leaflet never re-queues an element whose src was cleared
      // externally. The browser's own HTTP/2 multiplexer handles concurrent
      // tile requests efficiently, so leaving them in flight is cheaper than
      // the blank-tile artifacts that cancellation caused.
      let zoomLevelAtStart = map.getZoom();
      map.on("zoomstart", () => {
        zoomLevelAtStart = map.getZoom();
      });

      // After a multi-step zoom, force a full tile grid refresh so Leaflet
      // loads the correct tiles for the final zoom level. This catches the
      // race where Leaflet's internal tile-key bookkeeping drifts across
      // several rapid zoom steps and some tiles end up permanently blank.
      map.on("zoomend", () => {
        const currentTile = tileRef.current;
        if (!currentTile || !leafletRef.current) return;
        const zoomDelta = Math.abs(leafletRef.current.getZoom() - zoomLevelAtStart);
        // If we jumped more than 2 zoom levels at once, the tile grid is
        // likely in a stale state — redraw it.
        if (zoomDelta >= 2) {
          // redraw() tells Leaflet to re-evaluate which tiles are needed and
          // request any that are missing. It is safe to call at any time and
          // does not flash: existing loaded tiles remain visible.
          currentTile.redraw();
        }
      });

      // Retry tiles that fail to load (network hiccup, CDN blip).
      // Uses exponential back-off (1.5s → 4s) and a maximum of 2 attempts.
      // Guards:
      //  - retryCounts ensures we never loop indefinitely.
      //  - tileLayerRef check ensures we don't retry tiles from an old
      //    layer that was already swapped out during a theme change.
      const retryCounts = new Map<string, number>();
      const attachTileErrorHandler = (tileLayer: any) => {
        tileLayer.on("tileerror", (evt: any) => {
          // Only retry if this is still the active tile layer.
          if (tileRef.current !== tileLayer) return;
          const url: string = evt.tile?.src ?? "";
          if (!url) return;
          const attempts = retryCounts.get(url) ?? 0;
          retryCounts.set(url, attempts + 1);
          if (attempts >= 2) {
            // CARTO failed twice — fall back to OSM tiles silently.
            // Parse z/x/y from the failed URL and rebuild as OSM URL.
            const match = url.match(/\/([0-9]+)\/([0-9]+)\/([0-9]+)(?:[@\?]|$|\.png)/);
            if (match && evt.tile) {
              const [, z, x, y] = match;
              evt.tile.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            }
            return;
          }
          const delay = attempts === 0 ? 1500 : 4000;
          setTimeout(() => {
            // Double-check the layer is still active at retry time.
            if (tileRef.current !== tileLayer) return;
            if (evt.tile && leafletRef.current) {
              // Append a cache-bust param so the browser doesn't serve
              // the cached failed response.
              evt.tile.src = url.includes("?") ? `${url}&_r=${attempts}` : `${url}?_r=${attempts}`;
            }
          }, delay);
        });
      };
      attachTileErrorHandler(tile);

      // When the host container resizes (e.g. sidebar opens/closes) the
      // map must re-measure itself and fill in the newly revealed edge
      // tiles. Without debouncing, a CSS transition fires this callback
      // on every frame (~60/s) for the full animation duration — pure
      // wasted work. A 120ms debounce means it fires exactly once, after
      // the animation settles, which is all that's needed.
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const ro = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (leafletRef.current) leafletRef.current.invalidateSize({ animate: false });
          resizeTimer = null;
        }, 120);
      });
      if (mapRef.current) ro.observe(mapRef.current);
      // Store the observer so cleanup can disconnect it.
      (map as any)._rasaResizeObserver = ro;

      L.control.zoom({ position: "bottomleft" }).addTo(map);

      // Force a size re-measurement on the next frame. This handles the
      // case where the host flex container hasn't finished its layout
      // pass when L.map() runs synchronously — which causes Leaflet to
      // think the container is 0×0 or smaller than it really is, leaving
      // blank tile strips along the edges.
      requestAnimationFrame(() => {
        if (leafletRef.current) leafletRef.current.invalidateSize({ animate: false });
      });

      // Map + tiles are live now — let everything else (markers, in plain
      // mode for the moment) render right away.
      setMapReady(true);

      // Clustering is a pure enhancement, loaded in the background with its
      // own timeout/fallback. If/when it becomes available it upgrades the
      // already-visible plain markers into a cluster group — it never gates
      // the initial paint.
      loadCluster(5000).then((clusterOk) => {
        if (destroyed || !leafletRef.current) return;
        clusterAvailableRef.current = clusterOk;
        if (!clusterOk) return;

        const cluster = (L as any).markerClusterGroup({
          chunkedLoading: true,
          chunkInterval: 200,
          chunkDelay: 50,
          maxClusterRadius: 60,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          iconCreateFunction: (c: any) => makeClusterIcon(L, c.getChildCount()),
        });
        clusterRef.current = cluster;
        leafletRef.current.addLayer(cluster);

        // Tell the marker-sync effect to rebuild into the new cluster group.
        setClusterEpoch((n) => n + 1);
      });
    })().catch((err) => {
      if (!destroyed) console.error("[RealMap] init failed:", err);
    });

    return () => {
      destroyed = true;
      if (leafletRef.current) {
        // Disconnect the resize observer before tearing down the map so
        // it doesn't fire invalidateSize on a null leafletRef.
        const ro = (leafletRef.current as any)._rasaResizeObserver;
        if (ro) ro.disconnect();
        leafletRef.current.remove();
        leafletRef.current = null;
        tileRef.current = null;
        clusterRef.current = null;
        markersRef.current = new Map();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Marker sync ───────────────────────────────────────────────
  // Rebuilds the marker set whenever the billboard list changes.
  // Works in both cluster mode and plain mode.
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    // Capture a cancellation flag so the async continuation below
    // doesn't mutate refs if this effect's cleanup runs first.
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled) return;
      const map = leafletRef.current;
      const cluster = clusterRef.current;
      if (!map) return;

      // Expose popup click handler
      (window as any).__rasamapSelect = (id: number) => {
        const b = billboards.find((x) => x.id === id);
        if (b) onOpenDetails(b);
      };

      // Clear existing markers — always remove from map directly AND clear cluster.
      // This is critical: when clusterEpoch bumps (clustering loads after first render),
      // plain markers were added via m.addTo(map) in the first run. cluster.clearLayers()
      // only affects the cluster group and leaves those plain markers on the map, causing
      // duplicates. We must always remove every tracked marker from the map itself.
      markersRef.current.forEach((m: any) => map.removeLayer(m));
      if (cluster) {
        cluster.clearLayers();
      }
      markersRef.current = new Map();

      const newMarkers: any[] = [];

      for (const b of billboards) {
        const coords = resolveCoords(b);
        if (!coords) continue;

        const color = markerColor(b, selectedId, compareIds);
        const scale = selectedId === b.id ? 1.3 : 1;
        const icon = buildIcon(L, color, scale, b.icon);
        const marker = L.marker(coords, { icon });

        const isAvail = b.status === "available";
        marker.bindPopup(`
          <div style="font-family:Vazirmatn,sans-serif;direction:rtl;min-width:200px;background:var(--bg-card);color:var(--text-main);border-radius:10px;overflow:hidden;">
            <div style="padding:12px 14px;border-bottom:1px solid var(--border);">
              <div style="font-size:0.9rem;font-weight:700;margin-bottom:3px">${b.name.substring(0, 35)}…</div>
              <div style="font-size:0.72rem;color:var(--text-muted)">${b.region} · ${b.city}</div>
            </div>
            <div style="padding:10px 14px;">
              <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:6px">
                <span style="color:var(--text-muted)">ابعاد</span><span>${b.width}×${b.height} متر</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:6px">
                <span style="color:var(--text-muted)">بازدید/روز</span>
                <span style="color:#22C55E">~${Math.round(b.estimatedViews / 1000)}K نفر</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:10px">
                <span style="color:var(--text-muted)">قیمت/ماه</span>
                <span style="color:#FFB300;font-weight:700">${b.price}M تومان</span>
              </div>
              <div style="
                background:${isAvail ? "#FF4D00" : "#4B5563"};
                color:#fff;text-align:center;padding:7px;border-radius:7px;
                font-size:0.8rem;font-weight:700;cursor:pointer;font-family:Vazirmatn,sans-serif;
              " onclick="window.__rasamapSelect(${b.id})">
                ${isAvail ? "مشاهده + رزرو" : "مشغول است"}
              </div>
            </div>
          </div>`,
          { className: "rasamap-popup", maxWidth: 240 },
        );

        marker.on("click", () => { onSelect(b); marker.openPopup(); });
        markersRef.current.set(b.id, marker);
        newMarkers.push(marker);
      }

      if (cluster) {
        // Batch add — MarkerClusterGroup handles chunked async insertion
        cluster.addLayers(newMarkers);
      } else {
        // Fallback: add directly to map (no clustering)
        newMarkers.forEach((m: any) => m.addTo(map));
      }

      // After markers are placed, if a billboard is already selected (e.g.
      // the map page opened with ?focus=ID), open its popup and fly to it.
      // This must happen HERE (post-placement) because the selection-effect
      // runs before markers exist on the first render cycle.
      if (selectedId !== null) {
        const selBillboard = billboards.find(b => b.id === selectedId);
        const selMarker = markersRef.current.get(selectedId);
        if (selBillboard && selMarker) {
          const coords = resolveCoords(selBillboard);
          if (coords && leafletRef.current) {
            const targetZoom = Math.max(leafletRef.current.getZoom(), 15);
            leafletRef.current.flyTo(coords, targetZoom, { animate: true, duration: 0.8 });
          }
          // Small delay so the map has time to start flying before opening popup
          setTimeout(() => {
            if (!cancelled && markersRef.current.get(selectedId)) {
              markersRef.current.get(selectedId).openPopup();
            }
          }, 600);
        }
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billboards, mapReady, clusterEpoch]);

  // ── Selection / compare icon updates ─────────────────────────
  useEffect(() => {
    if (!leafletRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !leafletRef.current) return;
      for (const b of billboards) {
        const marker = markersRef.current.get(b.id);
        if (!marker) continue;
        const color = markerColor(b, selectedId, compareIds);
        const scale = selectedId === b.id ? 1.3 : 1;
        marker.setIcon(buildIcon(L, color, scale, b.icon));
        if (selectedId === b.id) {
          const coords = resolveCoords(b);
          marker.openPopup();
          if (coords && leafletRef.current) {
            // Fly in close enough that the pin is clearly "front and center" —
            // never zoom OUT if the user is already closer than this.
            const targetZoom = Math.max(leafletRef.current.getZoom(), 15);
            leafletRef.current.flyTo(coords, targetZoom, { animate: true, duration: 0.6 });
          }
        }
      }
    });
    return () => { cancelled = true; };
  }, [selectedId, compareIds, billboards]);

  // ── Fly to province/city ──────────────────────────────────────
  // Also depends on mapReady so it fires when the map first becomes ready
  // AND flyTo is already set (e.g. map page opened with ?focus=ID but no
  // selectedId — e.g. province/city navigation from the explore page).
  useEffect(() => {
    if (!mapReady || !leafletRef.current || !flyTo) return;
    // If a pin is selected, the marker-sync effect handles the fly + popup.
    if (selectedId !== null) return;
    leafletRef.current.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom, { animate: true, duration: 1.3 });
  }, [flyTo, mapReady, selectedId]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>{`
        .marker-cluster { background-clip: padding-box; }
        .marker-cluster div { margin: 0; }
        .rasamap-popup .leaflet-popup-content-wrapper {
          background: var(--bg-card) !important;
          border: 1px solid var(--border) !important;
          border-radius: 12px !important;
          padding: 0 !important;
          box-shadow: 0 16px 40px rgba(0,0,0,0.3) !important;
        }
        .rasamap-popup .leaflet-popup-content {
          margin: 0 !important; color: var(--text-main) !important;
        }
        .rasamap-popup .leaflet-popup-tip { background: var(--border) !important; }
        .rasamap-popup .leaflet-popup-close-button {
          color: var(--text-muted) !important; font-size: 1.1rem !important;
          top: 6px !important; left: 6px !important; right: auto !important;
        }
        .leaflet-container { font-family: Vazirmatn, sans-serif !important; z-index: 1 !important; }
        .leaflet-pane, .leaflet-top, .leaflet-bottom,
        .leaflet-control, .leaflet-popup-pane,
        .leaflet-marker-pane { z-index: 1 !important; }
        .leaflet-control-attribution {
          background: var(--bg-card) !important; color: var(--text-muted) !important; font-size: 0.6rem !important;
        }
        .leaflet-control-attribution a { color: #FF4D00 !important; }
        .leaflet-control-zoom a {
          background: var(--bg-card) !important; border-color: var(--border) !important;
          color: var(--text-main) !important;
        }
        .leaflet-control-zoom a:hover { background: var(--bg-surface) !important; }
      `}</style>

      <div style={{ flex: 1, position: "relative", zIndex: 1, overflow: "hidden" }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

        {/* Stats overlay */}
        <div style={{
          position: "absolute", top: 14, right: 14, zIndex: 1000,
          display: "flex", gap: 8, pointerEvents: "none",
        }}>
          {[
            { num: billboards.filter(b => b.status === "available").length, label: "خالی", color: "var(--accent)" },
            { num: billboards.filter(b => b.status === "busy").length, label: "مشغول", color: "var(--red)" },
            { num: billboards.length, label: "کل", color: "var(--text-main)" },
          ].map(s => (
            <div key={s.label} style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "7px 14px", backdropFilter: "blur(8px)", textAlign: "center",
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
            }}>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: s.color }}>{s.num}</div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{
          position: "absolute", left: 60, bottom: 30, zIndex: 1000,
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "10px 14px", backdropFilter: "blur(8px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 7, fontWeight: 600 }}>وضعیت رسانه‌ها</div>
          {[
            ["var(--accent)", "خالی"],
            ["var(--red)", "مشغول"],
            ["var(--accent-warm)", "انتخاب‌شده"],
            ["#9333ea", "در مقایسه"],
          ].map(([c, l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.73rem", marginBottom: 4, color: "var(--text-main)" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: c, flexShrink: 0 }} />
              {l}
            </div>
          ))}
        </div>

        {billboards.length === 0 && (
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 1000, background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "14px 20px", textAlign: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)", maxWidth: 240,
          }}>
            <div style={{ fontSize: "1.6rem", marginBottom: 6 }}>📭</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>هنوز رسانه‌ای در این منطقه ثبت نشده است</div>
          </div>
        )}
      </div>
    </>
  );
}