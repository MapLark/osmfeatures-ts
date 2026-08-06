/** Helpers for MapLark OSM Features API GeoJSON payloads. */

export type GeometryGroupId = 'points' | 'lines' | 'polygons';

export type GeoJSONGeometryLike = { type: string; coordinates?: unknown } | null;

export type QueryFeatureLike = {
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry: GeoJSONGeometryLike;
};

export function geometryGroup(geometryType: string): GeometryGroupId | null {
  if (geometryType === 'Point' || geometryType === 'MultiPoint') {
    return 'points';
  }
  if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
    return 'lines';
  }
  if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
    return 'polygons';
  }
  return null;
}

export function parseFeatureId(id: string | number | undefined): { type: string; osmId: string } {
  if (typeof id === 'number' && Number.isFinite(id)) {
    return { type: '', osmId: String(id) };
  }
  if (typeof id !== 'string' || id.trim() === '') {
    return { type: '', osmId: '' };
  }
  const slash = id.indexOf('/');
  if (slash <= 0 || slash === id.length - 1) {
    return { type: '', osmId: id };
  }
  return { type: id.slice(0, slash), osmId: id.slice(slash + 1) };
}

export function readTags(properties: Record<string, unknown> | undefined): Record<string, unknown> {
  const tags = properties?.['tags'];
  if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
    return tags as Record<string, unknown>;
  }
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function collectPositions(coordinates: unknown, out: number[][]): void {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return;
  }
  if (typeof coordinates[0] === 'number') {
    out.push(coordinates as number[]);
    return;
  }
  for (const item of coordinates as unknown[]) {
    collectPositions(item, out);
  }
}

/** `[[minLon, minLat], [maxLon, maxLat]]`, or null when the geometry has no coordinates. */
export function geometryBounds(geometry: GeoJSONGeometryLike): [[number, number], [number, number]] | null {
  const positions: number[][] = [];
  collectPositions(geometry?.coordinates, positions);
  if (positions.length === 0) {
    return null;
  }
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of positions) {
    if (lon! < minLon) minLon = lon!;
    if (lon! > maxLon) maxLon = lon!;
    if (lat! < minLat) minLat = lat!;
    if (lat! > maxLat) maxLat = lat!;
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

/**
 * Feature center as `[lon, lat]`.
 * Non-points: `properties.centroid` from PostGIS (`centroid=true`).
 * Points: the Point coordinates themselves (API omits centroid on nodes).
 */
export function featureCentroid(feature: QueryFeatureLike): [number, number] | null {
  const group = geometryGroup(feature.geometry?.type?.trim() ?? '');
  if (group === 'points') {
    const coords = feature.geometry?.coordinates;
    if (feature.geometry?.type === 'Point' && Array.isArray(coords) && typeof coords[0] === 'number') {
      return [coords[0] as number, coords[1] as number];
    }
    if (feature.geometry?.type === 'MultiPoint' && Array.isArray(coords) && coords.length === 1) {
      const point = coords[0] as number[];
      if (typeof point?.[0] === 'number') {
        return [point[0], point[1]!];
      }
    }
    return null;
  }

  const centroid = feature.properties?.['centroid'];
  if (centroid && typeof centroid === 'object' && !Array.isArray(centroid)) {
    const coords = (centroid as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      return [coords[0], coords[1]];
    }
  }
  return null;
}
