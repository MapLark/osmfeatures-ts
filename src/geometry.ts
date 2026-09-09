/** Local geometry helpers. No HTTP. The planner must not invent containment. */

type Ring = number[][];

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const x1 = ring[i]![0]!;
    const y1 = ring[i]![1]!;
    const next = ring[(i + 1) % n]!;
    const x2 = next[0]!;
    const y2 = next[1]!;
    if ((y1 > lat) !== (y2 > lat)) {
      const xAtLat = x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1);
      if (lon < xAtLat) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function pointInPolygonRings(lon: number, lat: number, rings: unknown[]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (Array.isArray(ring) && ring.length > 0 && pointInRing(lon, lat, ring as Ring)) {
      inside = !inside;
    }
  }
  return inside;
}

export type GeometryLike = {
  type?: string;
  coordinates?: unknown;
  geometries?: unknown;
  geometry?: GeometryLike | null;
};

function pointInUnknown(lon: number, lat: number, geom: unknown, depth: number): boolean {
  if (geom == null || typeof geom !== 'object' || depth > 4) {
    return false;
  }
  const g = geom as GeometryLike;
  const gtype = g.type;
  if (gtype === 'Polygon') {
    const coords = g.coordinates;
    return Array.isArray(coords) && pointInPolygonRings(lon, lat, coords);
  }
  if (gtype === 'MultiPolygon') {
    const coords = g.coordinates;
    return Array.isArray(coords)
      && coords.some((poly) => Array.isArray(poly) && poly.length > 0
        && pointInPolygonRings(lon, lat, poly));
  }
  if (gtype === 'GeometryCollection') {
    const parts = g.geometries;
    return Array.isArray(parts) && parts.some((part) => pointInUnknown(lon, lat, part, depth + 1));
  }
  if (gtype === 'Feature' || (gtype == null && g.geometry != null)) {
    return pointInUnknown(lon, lat, g.geometry, depth + 1);
  }
  return false;
}

/**
 * Point-in-polygon for GeoJSON Polygon/MultiPolygon, including holes.
 * Also accepts a Feature, GeometryCollection, or `{ geometry }` (isochrone body).
 */
export function point_in_geometry(lon: number, lat: number, geom: unknown): boolean {
  return pointInUnknown(lon, lat, geom, 0);
}
