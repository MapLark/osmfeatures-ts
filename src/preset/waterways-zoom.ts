import type { OSMFeaturesLayerPreset } from './catalog.js';

// waterways detail floors (omit zoom = full detail, same as z >= FULL):
//   z >= 13 — river + canal + stream + drain + ditch
//   z == 12 — river + canal
//   z < 12  — river only
// Matches OpenMapTiles waterway class generalization (OSM data; no Natural Earth).
export const WATERWAYS_FULL_DETAIL_ZOOM = 13;
const WATERWAYS_CANAL_ZOOM = 12;

const WATERWAYS_RIVER_OR_TAGS = ['waterway=river'];

const WATERWAYS_RIVER_CANAL_OR_TAGS = [...WATERWAYS_RIVER_OR_TAGS, 'waterway=canal'];

/** Opt-in: drop minor waterways on waterways as map zooms out. Omit zoom for full detail. */
export function applyWaterwaysZoomPolicy<T extends OSMFeaturesLayerPreset>(
  preset: T,
  zoom?: number,
): T {
  if (preset.id !== 'waterways' || zoom == null || zoom >= WATERWAYS_FULL_DETAIL_ZOOM) {
    return preset;
  }

  const orTags =
    zoom < WATERWAYS_CANAL_ZOOM ? WATERWAYS_RIVER_OR_TAGS : WATERWAYS_RIVER_CANAL_OR_TAGS;

  return {
    ...preset,
    tags: undefined,
    orTags: [...orTags],
    notTags: preset.notTags,
  };
}
