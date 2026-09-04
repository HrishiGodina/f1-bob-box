import { CIRCUIT_GEOJSON } from './index';

// Slug validation/passthrough map — maps user input to canonical circuit identifiers
export const CIRCUIT_ID_MAP: Record<string, string> = {
  bahrain: 'bahrain', jeddah: 'jeddah', albert_park: 'albert_park',
  suzuka: 'suzuka', shanghai: 'shanghai', miami: 'miami', imola: 'imola',
  monaco: 'monaco', villeneuve: 'villeneuve', catalunya: 'catalunya',
  red_bull_ring: 'red_bull_ring', silverstone: 'silverstone',
  hungaroring: 'hungaroring', spa: 'spa', zandvoort: 'zandvoort',
  monza: 'monza', baku: 'baku', marina_bay: 'marina_bay',
  americas: 'americas', rodriguez: 'rodriguez', interlagos: 'interlagos',
  las_vegas: 'las_vegas', vegas: 'las_vegas', losail: 'losail', yas_marina: 'yas_marina',
  madring: 'madring',
};

/**
 * Convert GeoJSON feature geometry to SVG path string with automatic scaling/centering.
 * Handles both LineString and Polygon geometries. Returns empty string on error.
 */
export const geoJsonToSvgPath = (geojson: any, w = 440, h = 310, pad = 24): string => {
  try {
    const feat = geojson?.features?.[0];
    if (!feat) return '';
    const coords: [number, number][] = feat.geometry.type === 'LineString'
      ? feat.geometry.coordinates
      : feat.geometry.coordinates[0];
    if (!coords?.length) return '';

    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const spanLon = maxLon - minLon || 1;
    const spanLat = maxLat - minLat || 1;
    const scale = Math.min((w - pad * 2) / spanLon, (h - pad * 2) / spanLat);
    const offX = pad + ((w - pad * 2) - spanLon * scale) / 2;
    const offY = pad + ((h - pad * 2) - spanLat * scale) / 2;

    const pts = coords.map(([lon, lat]) => [
      offX + (lon - minLon) * scale,
      offY + (maxLat - lat) * scale,
    ] as [number, number]);

    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';
  } catch {
    return '';
  }
};

/**
 * Simple FNV-1a hash function for strings. Used as seed for deterministic procedural generation.
 */
export const hashString = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/**
 * Mulberry32 PRNG: fast seeded random generator returning a function that yields [0,1) values.
 */
export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Generate a procedural track path (SVG) for a circuit when GeoJSON is unavailable.
 * Deterministic based on circuit ID so the same circuit always generates the same pattern.
 */
export const fallbackTrackPath = (circuitId: string) => {
  const rand = mulberry32(hashString(circuitId || 'default'));
  const cx = 220, cy = 155;
  const n = 10;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const r = 80 + rand() * 90;
    pts.push([cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 0.82]);
  }
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';
  return d;
};

// Lowercased, underscore-free circuit slugs from CIRCUIT_GEOJSON, longest first,
// so "red_bull_ring" matches before a shorter unrelated substring would.
// Each keyword is matched on word boundaries (not as a plain substring) so
// e.g. "spa" doesn't false-positive inside "ESPANA"/"SPANISH".
const CIRCUIT_KEYWORDS = Object.keys(CIRCUIT_GEOJSON)
  .map((slug) => {
    const keyword = slug.replace(/_/g, " ");
    return { slug, keyword, pattern: new RegExp(`\\b${keyword}\\b`) };
  })
  .sort((a, b) => b.keyword.length - a.keyword.length);

/**
 * Best-effort match of a live-feed session/meeting name (e.g.
 * "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2026") to a known circuit slug,
 * by scanning for a circuit keyword on a word boundary. Returns null when
 * nothing matches — callers fall back to no track outline.
 */
export function resolveCircuitKey(sessionName: string | null | undefined): string | null {
  if (!sessionName) return null;
  const normalized = sessionName.toLowerCase();
  for (const { slug, pattern } of CIRCUIT_KEYWORDS) {
    if (pattern.test(normalized)) return slug;
  }
  return null;
}
