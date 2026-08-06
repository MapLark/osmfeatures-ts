import type { OSMFeaturesLayerPreset } from './catalog.js';

// roads_paths detail floors (omit zoom = full detail, same as z >= FULL):
//   z >= 13     — full highway set
//   11 <= z < 13 — arteries + neighbourhood roads (whitelist; no service/track/paths)
//   z < 11      — major roads only (whitelist)
export const ROADS_PATHS_FULL_DETAIL_ZOOM = 13.5;
const ROADS_PATHS_MAJOR_ZOOM = 12.4;

const ROADS_PATHS_MAJOR_OR_TAGS = [
  'highway=motorway',
  'highway=motorway_link',
  'highway=trunk',
  'highway=trunk_link',
  'highway=primary',
  'highway=primary_link',
];

const ROADS_PATHS_MID_OR_TAGS = [
  ...ROADS_PATHS_MAJOR_OR_TAGS,
  'highway=secondary',
  'highway=secondary_link',
  'highway=tertiary',
  'highway=tertiary_link',
  'highway=unclassified',
  'highway=residential',
  'highway=living_street',
];

/** Opt-in: drop path / minor-road clutter on roads_paths as map zooms out. Omit zoom for full detail. */
export function applyRoadsPathsZoomPolicy<T extends OSMFeaturesLayerPreset>(
  preset: T,
  zoom?: number,
): T {
  if (preset.id !== 'roads_paths' || zoom == null || zoom >= ROADS_PATHS_FULL_DETAIL_ZOOM) {
    return preset;
  }

  const orTags =
    zoom < ROADS_PATHS_MAJOR_ZOOM ? ROADS_PATHS_MAJOR_OR_TAGS : ROADS_PATHS_MID_OR_TAGS;

  return {
    ...preset,
    tags: undefined,
    orTags: [...orTags],
    notTags: preset.notTags,
  };
}
