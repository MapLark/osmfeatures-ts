import type { OSMFeaturesPresetId } from './catalog.js';

// Buildings area floors by zoom (Web Mercator px size at bbox mid-lat):
//   z < 11.5 — drop tiny houses / small sheds (~0.5×0.5 px)
//   z < 12.5 — drop only true specks (~0.25×0.25 px)
const BUILDINGS_SMALL_AREA_ZOOM = 11.5;
const BUILDINGS_SPECK_AREA_ZOOM = 12.5;
const BUILDINGS_SMALL_PIXEL_EDGE = 0.5;
const BUILDINGS_SPECK_PIXEL_EDGE = 0.25;
const WEB_MERCATOR_METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392;

function bboxMidLatitude(bbox: string): number {
  const parts = bbox.split(',').map((value) => Number.parseFloat(value));
  const minLat = parts[1];
  const maxLat = parts[3];
  if (!Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
    return 0;
  }
  return (minLat + maxLat) / 2;
}

/** Opt-in: min_area_m2 so low-zoom building queries skip invisible footprints. Omit zoom for full detail. */
export function resolveBuildingsMinAreaM2(
  presetId: OSMFeaturesPresetId,
  bbox: string,
  zoom: number | undefined,
): number | undefined {
  if (presetId !== 'buildings' || zoom == null || zoom >= BUILDINGS_SPECK_AREA_ZOOM) {
    return undefined;
  }

  const latitude = bboxMidLatitude(bbox);
  const metersPerPixel =
    (WEB_MERCATOR_METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  // ponytail: z<11.5 uses 0.5px (tiny houses); z<12.5 uses 0.25px (specks only). Raise if still noisy.
  const pixelEdge = zoom < BUILDINGS_SMALL_AREA_ZOOM
    ? BUILDINGS_SMALL_PIXEL_EDGE
    : BUILDINGS_SPECK_PIXEL_EDGE;
  return (metersPerPixel * pixelEdge) ** 2;
}
