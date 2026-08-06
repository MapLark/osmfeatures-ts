/**
 * Opt-in OSM Features layer presets + zoom detail policies.
 *
 * Use nothing from here if you want raw tag queries only.
 *
 * Catalog (full detail; no zoom floors; no bbox)
 *   OSM_FEATURES_LAYER_PRESETS / OSM_FEATURES_LAYER_PRESET_ORDER
 *   getPreset(id)
 *
 * Resolve
 *   resolvePresetFromQuery({ preset, bbox, zoom? })
 *   resolveCustomLayerFromQuery({ tags?/or_tags?/not_tags?, bbox })
 *   resolveLayerFromQuery(...) — preset if set, else custom tags
 *   bbox required — zoom optional (omit for full catalog detail)
 *
 * Policies (callable alone; omit zoom = no-op / full detail)
 *   applyRoadsPathsZoomPolicy(preset, zoom?)
 *   applyWaterwaysZoomPolicy(preset, zoom?)
 *   applyPublicTransportZoomPolicy(preset, zoom?)
 *   resolveBuildingsMinAreaM2(presetId, bbox, zoom?)  → optional min_area_m2
 *   ROADS_PATHS_FULL_DETAIL_ZOOM — z at/above this keeps all highway tags
 *   WATERWAYS_FULL_DETAIL_ZOOM — z at/above this keeps all waterway classes
 *   PUBLIC_TRANSPORT_FULL_DETAIL_ZOOM — z at/above this keeps all transport tags
 */

export {
  OSM_FEATURES_LAYER_PRESETS,
  OSM_FEATURES_LAYER_PRESET_ORDER,
  type OSMFeaturesLayerPreset,
  type OSMFeaturesPresetId,
} from './catalog.js';

export {
  applyRoadsPathsZoomPolicy,
  ROADS_PATHS_FULL_DETAIL_ZOOM,
} from './roads-paths-zoom.js';
export {
  applyWaterwaysZoomPolicy,
  WATERWAYS_FULL_DETAIL_ZOOM,
} from './waterways-zoom.js';
export {
  applyPublicTransportZoomPolicy,
  PUBLIC_TRANSPORT_FULL_DETAIL_ZOOM,
} from './public-transport-zoom.js';
export { resolveBuildingsMinAreaM2 } from './buildings-min-area.js';
export {
  getPreset,
  resolvePresetFromQuery,
  resolveCustomLayerFromQuery,
  resolveLayerFromQuery,
  type PresetQuery,
  type ResolvedCustomLayer,
  type ResolvedDemoLayer,
  type ResolvedPresetLayer,
} from './resolve.js';
