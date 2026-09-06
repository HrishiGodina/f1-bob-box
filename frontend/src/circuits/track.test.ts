import { describe, it, expect } from 'vitest';
import {
  CIRCUIT_ID_MAP,
  geoJsonToSvgPath,
  hashString,
  mulberry32,
  fallbackTrackPath,
  resolveCircuitKey,
} from './track';

describe('track utilities', () => {
  describe('CIRCUIT_ID_MAP', () => {
    it('should contain all expected circuit slugs', () => {
      expect(CIRCUIT_ID_MAP['bahrain']).toBe('bahrain');
      expect(CIRCUIT_ID_MAP['monaco']).toBe('monaco');
      expect(CIRCUIT_ID_MAP['monza']).toBe('monza');
      expect(CIRCUIT_ID_MAP['suzuka']).toBe('suzuka');
    });

    it('should map aliases correctly', () => {
      expect(CIRCUIT_ID_MAP['vegas']).toBe('las_vegas');
    });
  });

  describe('geoJsonToSvgPath', () => {
    it('should return empty string for null/undefined geojson', () => {
      expect(geoJsonToSvgPath(null)).toBe('');
      expect(geoJsonToSvgPath(undefined)).toBe('');
    });

    it('should return empty string for geojson without features', () => {
      expect(geoJsonToSvgPath({ features: [] })).toBe('');
      expect(geoJsonToSvgPath({ features: null })).toBe('');
    });

    it('should generate SVG path for valid LineString geojson', () => {
      const geojson = {
        features: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
                [2, 0],
              ],
            },
          },
        ],
      };
      const path = geoJsonToSvgPath(geojson);
      expect(path).toBeTruthy();
      expect(path).toContain('M');
      expect(path).toContain('L');
      expect(path).toContain('Z');
    });

    it('should generate SVG path for valid Polygon geojson', () => {
      const geojson = {
        features: [
          {
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 1],
                  [2, 0],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      };
      const path = geoJsonToSvgPath(geojson);
      expect(path).toBeTruthy();
      expect(path).toContain('M');
      expect(path).toContain('Z');
    });

    it('should handle empty coordinates gracefully', () => {
      const geojson = {
        features: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [],
            },
          },
        ],
      };
      expect(geoJsonToSvgPath(geojson)).toBe('');
    });
  });

  describe('hashString', () => {
    it('should return a number', () => {
      expect(typeof hashString('test')).toBe('number');
    });

    it('should be deterministic', () => {
      const hash1 = hashString('circuit-id');
      const hash2 = hashString('circuit-id');
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different strings', () => {
      const hash1 = hashString('bahrain');
      const hash2 = hashString('monaco');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      expect(typeof hashString('')).toBe('number');
    });
  });

  describe('mulberry32', () => {
    it('should return a function', () => {
      const rng = mulberry32(42);
      expect(typeof rng).toBe('function');
    });

    it('should generate values in [0, 1)', () => {
      const rng = mulberry32(42);
      for (let i = 0; i < 100; i++) {
        const value = rng();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should be deterministic with same seed', () => {
      const rng1 = mulberry32(42);
      const values1 = Array.from({ length: 10 }, () => rng1());

      const rng2 = mulberry32(42);
      const values2 = Array.from({ length: 10 }, () => rng2());

      expect(values1).toEqual(values2);
    });

    it('should generate different sequences for different seeds', () => {
      const rng1 = mulberry32(42);
      const values1 = Array.from({ length: 10 }, () => rng1());

      const rng2 = mulberry32(43);
      const values2 = Array.from({ length: 10 }, () => rng2());

      expect(values1).not.toEqual(values2);
    });
  });

  describe('fallbackTrackPath', () => {
    it('should return an SVG path string', () => {
      const path = fallbackTrackPath('bahrain');
      expect(typeof path).toBe('string');
      expect(path).toContain('M');
      expect(path).toContain('Z');
    });

    it('should be deterministic for same circuit', () => {
      const path1 = fallbackTrackPath('bahrain');
      const path2 = fallbackTrackPath('bahrain');
      expect(path1).toBe(path2);
    });

    it('should generate different paths for different circuits', () => {
      const path1 = fallbackTrackPath('bahrain');
      const path2 = fallbackTrackPath('monaco');
      expect(path1).not.toBe(path2);
    });

    it('should handle empty string', () => {
      const path = fallbackTrackPath('');
      expect(typeof path).toBe('string');
      expect(path).toContain('M');
    });
  });

  describe('resolveCircuitKey', () => {
    it('should match "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2026" to bahrain', () => {
      expect(resolveCircuitKey('FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2026')).toBe(
        'bahrain'
      );
    });

    it('should match a Monaco GP name to monaco', () => {
      expect(resolveCircuitKey('FORMULA 1 MONACO GRAND PRIX 2026')).toBe('monaco');
    });

    it('should match a Monza GP name to monza', () => {
      expect(resolveCircuitKey('FORMULA 1 MONZA GRAND PRIX 2026')).toBe('monza');
    });

    it('should match a Suzuka GP name to suzuka', () => {
      expect(resolveCircuitKey('FORMULA 1 SUZUKA GRAND PRIX 2026')).toBe('suzuka');
    });

    it('should handle circuit names with underscores by matching their keyword form', () => {
      // "red_bull_ring" becomes "red bull ring" in keyword form
      expect(
        resolveCircuitKey('FORMULA 1 RED BULL RING GRAND PRIX 2026')
      ).toBe('red_bull_ring');
    });

    it('should match case-insensitively', () => {
      expect(resolveCircuitKey('formula 1 bahrain grand prix')).toBe('bahrain');
      expect(resolveCircuitKey('BAHRAIN')).toBe('bahrain');
    });

    it('should return null for unmatched names', () => {
      expect(resolveCircuitKey('Demo Grand Prix')).toBeNull();
      expect(resolveCircuitKey('Test Circuit')).toBeNull();
    });

    it('should return null for null input', () => {
      expect(resolveCircuitKey(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(resolveCircuitKey(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(resolveCircuitKey('')).toBeNull();
    });

    it('should prioritize longer keywords (red_bull_ring before other substrings)', () => {
      // This tests that the sorting by length works: "red bull ring" (12 chars) matches before
      // shorter circuit names that might have overlapping keywords
      expect(resolveCircuitKey('RED BULL RING 2026')).toBe('red_bull_ring');
    });

    it('should match circuits with spaces in the session name', () => {
      expect(resolveCircuitKey('F1 2026 SILVERSTONE BRITISH GRAND PRIX')).toBe(
        'silverstone'
      );
    });

    it("does not false-positive-match 'spa' inside Spanish GP names", () => {
      expect(resolveCircuitKey('FORMULA 1 ARAMCO GRAN PREMIO DE ESPANA 2026')).not.toBe('spa');
      expect(resolveCircuitKey('FORMULA 1 SPANISH GRAND PRIX 2026')).not.toBe('spa');
    });

    it('should match GP names that use the host country rather than the circuit name', () => {
      // Most official/meeting names never mention the circuit itself —
      // e.g. the real live feed reports "Italian Grand Prix" for Monza.
      expect(resolveCircuitKey('Italian Grand Prix')).toBe('monza');
      expect(resolveCircuitKey("FORMULA 1 PIRELLI GRAN PREMIO D’ITALIA 2026")).toBe('monza');
      expect(resolveCircuitKey('FORMULA 1 BELGIAN GRAND PRIX 2026')).toBe('spa');
      expect(resolveCircuitKey('FORMULA 1 BRITISH GRAND PRIX 2026')).toBe('silverstone');
      expect(resolveCircuitKey('FORMULA 1 JAPANESE GRAND PRIX 2026')).toBe('suzuka');
      expect(resolveCircuitKey('FORMULA 1 AZERBAIJAN GRAND PRIX 2026')).toBeNull();
    });

    it('does not alias Spain to any circuit, since Catalunya and Madring are both plausible', () => {
      expect(resolveCircuitKey('FORMULA 1 SPANISH GRAND PRIX 2026')).toBeNull();
      expect(resolveCircuitKey('FORMULA 1 ARAMCO GRAN PREMIO DE ESPANA 2026')).toBeNull();
    });
  });
});
