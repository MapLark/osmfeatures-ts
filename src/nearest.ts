/** Local nearest-neighbor join over two GeoJSON feature sets. No HTTP. */

import { featureCentroid, type QueryFeatureLike } from './geojson-feature.js';

// Mean Earth radius. ponytail: sphere, not WGS84 ellipsoid; swap if you need centimetre-grade distances.
const EARTH_RADIUS_M = 6_371_000;
// O(n×m) haversine. 500k is ~1000×500 or 10_000×50; search-sized joins fit.
export const MAX_COMPARISONS = 500_000;

export type NearestWithinPair = {
  feature: unknown;
  distance_m: number;
  nearest: unknown;
};

function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dlat = ((lat2 - lat1) * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(a, 1)));
}

function features(src: unknown): unknown[] {
  if (Array.isArray(src)) {
    return src;
  }
  if (src && typeof src === 'object') {
    const record = src as Record<string, unknown>;
    if (Array.isArray(record['features'])) {
      return record['features'] as unknown[];
    }
    const data = record['data'];
    if (data && typeof data === 'object' && Array.isArray((data as { features?: unknown }).features)) {
      return (data as { features: unknown[] }).features;
    }
  }
  throw new TypeError('expected a FeatureCollection or list of Features');
}

function lonLat(feat: unknown): [number, number] {
  if (!feat || typeof feat !== 'object') {
    throw new Error('feature must be a GeoJSON Feature dict');
  }
  const record = feat as Record<string, unknown>;
  const point = featureCentroid({
    geometry: (record['geometry'] ?? null) as QueryFeatureLike['geometry'],
    properties: record['properties'] as QueryFeatureLike['properties'],
  });
  if (point == null || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
    throw new Error('feature has no Point geometry or properties.centroid');
  }
  return point;
}

/**
 * Nearest secondary for each primary, within `maxDistanceM`.
 *
 * Accepts a FeatureCollection, a `{ data, meta }` `query` result,
 * or a list of Features. Point comes from `geometry` when it is a Point, else
 * `properties.centroid` (same rules as `featureCentroid`). A feature with
 * neither throws.
 *
 * Returns pairs sorted by `distance_m`:
 * `{ feature, distance_m, nearest }`
 *
 * `limit` keeps the closest pairs (SDK default 20). Pass `null` for every
 * primary that has a match. O(n×m) haversine. Fine at search `limit`
 * (default 100). Joins whose `len(primary) * len(secondary)` exceeds
 * `maxComparisons` (default 500_000) throw. Pass `maxComparisons: null`
 * for no cap.
 */
export function nearest_within(
  primary: unknown,
  secondary: unknown,
  maxDistanceM: number,
  {
    limit = 20,
    maxComparisons = MAX_COMPARISONS,
  }: {
    limit?: number | null;
    maxComparisons?: number | null;
  } = {},
): NearestWithinPair[] {
  if (limit != null && limit < 1) {
    throw new Error('limit must be a positive int');
  }
  if (maxComparisons != null && maxComparisons < 1) {
    throw new Error('max_comparisons must be a positive int');
  }
  const primaries = features(primary);
  const secondaries = features(secondary);
  if (primaries.length === 0 || secondaries.length === 0) {
    return [];
  }

  const n = primaries.length;
  const m = secondaries.length;
  if (maxComparisons != null && n * m > maxComparisons) {
    throw new Error(
      `nearest_within join is ${n}×${m} comparisons `
      + `(cap ${maxComparisons}). Shrink the collections `
      + '(places_search/nearby limit, not a large query()).',
    );
  }

  const secPts: Array<[unknown, [number, number]]> = secondaries.map((s) => [s, lonLat(s)]);
  const pairs: NearestWithinPair[] = [];
  for (const p of primaries) {
    const [plon, plat] = lonLat(p);
    let best: [number, unknown] | null = null;
    for (const [s, [slon, slat]] of secPts) {
      const d = haversineM(plon, plat, slon, slat);
      if (best === null || d < best[0]) {
        best = [d, s];
      }
    }
    if (best !== null && best[0] <= maxDistanceM) {
      pairs.push({ feature: p, distance_m: best[0], nearest: best[1] });
    }
  }
  pairs.sort((a, b) => a.distance_m - b.distance_m);
  return limit == null ? pairs : pairs.slice(0, limit);
}
