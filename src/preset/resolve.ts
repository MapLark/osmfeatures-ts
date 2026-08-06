import createHttpError from 'http-errors';
import {
  OSM_FEATURES_LAYER_PRESETS,
  type OSMFeaturesLayerPreset,
  type OSMFeaturesPresetId,
} from './catalog.js';
import { applyPublicTransportZoomPolicy } from './public-transport-zoom.js';
import { applyRoadsPathsZoomPolicy } from './roads-paths-zoom.js';
import { applyWaterwaysZoomPolicy } from './waterways-zoom.js';

type AppError = Error & {
  status?: number;
  code?: string;
  subtype?: string;
};

type QueryValue = unknown;
export type PresetQuery = Record<string, QueryValue>;

/** Catalog preset + required bbox for an upstream query. */
export type ResolvedPresetLayer = OSMFeaturesLayerPreset & { bbox: string };

/** Tag filters + bbox for a custom (non-preset) upstream query. */
export type ResolvedCustomLayer = {
  bbox: string;
  tags?: string[];
  orTags?: string[];
  notTags?: string[];
  type?: string;
  shape?: 'line' | 'polygon' | 'all';
};

export type ResolvedDemoLayer = ResolvedPresetLayer | ResolvedCustomLayer;

function appError(status: number, code: string, detail: string): AppError {
  const err = createHttpError(status, detail) as AppError;
  err.code = code;
  return err;
}

function optionalString(query: PresetQuery, key: string): string | undefined {
  const raw = query[key];
  if (raw == null || raw === '') {
    return undefined;
  }
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first == null || first === '') {
      return undefined;
    }
    return String(first);
  }
  return String(raw);
}

function optionalNumber(query: PresetQuery, key: string): number | undefined {
  const raw = query[key];
  if (raw == null || raw === '') {
    return undefined;
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : undefined;
  }
  const text = optionalString(query, key);
  if (text == null) {
    return undefined;
  }
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Repeatable query params (`tags=a&tags=b`) or one value. */
function stringList(query: PresetQuery, key: string): string[] {
  const raw = query[key];
  if (raw == null || raw === '') {
    return [];
  }
  const values = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const value of values) {
    if (value == null || value === '') {
      continue;
    }
    const trimmed = String(value).trim();
    if (trimmed) {
      out.push(trimmed);
    }
  }
  return out;
}

function requireBbox(query: PresetQuery): string {
  const bbox = optionalString(query, 'bbox');
  if (bbox == null) {
    throw appError(400, 'invalid_bbox', 'bbox is required.');
  }
  return bbox;
}

/** Catalog lookup only. No zoom policies. */
export function getPreset(id: string): OSMFeaturesLayerPreset | undefined {
  return OSM_FEATURES_LAYER_PRESETS[id as OSMFeaturesPresetId];
}

/**
 * Opt-in helper: resolve `preset` + required `bbox` (+ optional `zoom`) from a query map.
 * Applies known zoom tag policies (roads_paths, waterways, public_transport). Does not set min_area_m2.
 */
export function resolvePresetFromQuery(query: PresetQuery): ResolvedPresetLayer {
  const rawPreset = query['preset'];
  if (typeof rawPreset !== 'string' || rawPreset.trim() === '') {
    throw appError(400, 'invalid_preset', 'preset is required.');
  }

  const presetId = rawPreset.trim();
  const preset = getPreset(presetId);
  if (!preset) {
    throw appError(400, 'invalid_preset', `Unknown preset: ${presetId}`);
  }

  const withBbox: ResolvedPresetLayer = { ...preset, bbox: requireBbox(query) };
  const zoom = optionalNumber(query, 'zoom');
  // Zoom optional: omit / invalid → catalog tags as-is (full detail).
  if (zoom == null) {
    return withBbox;
  }
  return applyPublicTransportZoomPolicy(
    applyWaterwaysZoomPolicy(applyRoadsPathsZoomPolicy(withBbox, zoom), zoom),
    zoom,
  );
}

/**
 * Custom layer: `tags` / `or_tags` / `not_tags` + required `bbox`.
 * Optional `type` / `shape`. Needs at least one positive filter (`tags` or `or_tags`).
 */
export function resolveCustomLayerFromQuery(query: PresetQuery): ResolvedCustomLayer {
  const tags = stringList(query, 'tags');
  const orTags = stringList(query, 'or_tags');
  const notTags = stringList(query, 'not_tags');
  if (tags.length === 0 && orTags.length === 0) {
    throw appError(400, 'invalid_tags', 'tags or or_tags is required for a custom layer.');
  }

  const layer: ResolvedCustomLayer = { bbox: requireBbox(query) };
  if (tags.length > 0) {
    layer.tags = tags;
  }
  if (orTags.length > 0) {
    layer.orTags = orTags;
  }
  if (notTags.length > 0) {
    layer.notTags = notTags;
  }
  const type = optionalString(query, 'type');
  if (type) {
    layer.type = type;
  }
  const shape = optionalString(query, 'shape');
  if (shape === 'line' || shape === 'polygon' || shape === 'all') {
    layer.shape = shape;
  }
  return layer;
}

/**
 * Demo / relay helper: `preset`+bbox, or custom `tags`/`or_tags`/`not_tags`+bbox.
 * Preset wins when both are present.
 */
export function resolveLayerFromQuery(query: PresetQuery): ResolvedDemoLayer {
  const rawPreset = query['preset'];
  if (typeof rawPreset === 'string' && rawPreset.trim() !== '') {
    return resolvePresetFromQuery(query);
  }
  return resolveCustomLayerFromQuery(query);
}
