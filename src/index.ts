import createHttpError from 'http-errors';

type AppError = Error & {
  status?: number;
  code?: string;
  subtype?: string;
  upstreamStatus?: number;
  upstreamDetail?: string;
};

/** Response metadata from headers (not part of GeoJSON body). */
export type OSMFeaturesMeta = {
  returned: number;
  has_more: boolean;
  next_cursor: string | null;
  /** From ``X-Usage-Units-Charged`` when present (authenticated API). */
  units_charged?: number;
  /** Set by ``query_all`` only (pages fetched). */
  page_count?: number;
  relay_partial?: boolean;
  relay_partial_reason?: string;
};

/** Wire GeoJSON FeatureCollection (no pagination fields). */
export type OSMGeoJSONPayload = {
  type: 'FeatureCollection';
  features: unknown[];
};

/** GeoJSON page: FeatureCollection body + header-derived meta. */
export type OSMGeoJSONResult = {
  data: OSMGeoJSONPayload;
  meta: OSMFeaturesMeta;
};

/** Any Accept: GeoJSON page, or raw bytes in ``data`` for binary encodings. */
export type OSMFeaturesResult = {
  data: OSMGeoJSONPayload | ArrayBuffer;
  meta: OSMFeaturesMeta;
};

function resultFromFeatures(
  features: unknown[],
  meta: OSMFeaturesMeta,
): OSMGeoJSONResult {
  return {
    data: { type: 'FeatureCollection', features },
    meta,
  };
}

function metaFromHeaders(headers: Headers, featureCount: number): OSMFeaturesMeta {
  const returnedRaw = headers.get('X-Returned');
  const parsed = returnedRaw != null && returnedRaw !== '' ? Number.parseInt(returnedRaw, 10) : Number.NaN;
  const nextCursor = headers.get('X-Next-Cursor');
  const unitsRaw = headers.get('X-Usage-Units-Charged');
  const unitsParsed = unitsRaw != null && unitsRaw !== '' ? Number(unitsRaw) : Number.NaN;
  const meta: OSMFeaturesMeta = {
    returned: Number.isFinite(parsed) ? parsed : featureCount,
    has_more: (headers.get('X-Has-More') || 'false').toLowerCase() === 'true',
    next_cursor: nextCursor && nextCursor.length > 0 ? nextCursor : null,
  };
  if (Number.isFinite(unitsParsed)) {
    meta.units_charged = unitsParsed;
  }
  return meta;
}

/** Layer filters from presets / custom resolve. Pass into `resolveRequest` or spread into `query`. */
export type OSMFeaturesLayer = {
  bbox?: string;
  tags?: string[];
  orTags?: string[];
  notTags?: string[];
  type?: string;
  wayShape?: 'line' | 'polygon' | 'all';
  /** @deprecated Use `wayShape`. */
  shape?: 'line' | 'polygon' | 'all';
};

/** Flat query params (same idea as Python `query(**params)`). */
export type OSMFeaturesParams = OSMFeaturesLayer & {
  /** Page size. Omit to use the API default (1000). Max `6000`. */
  limit?: number;
  cursor?: string;
  zoom?: number;
  /** Point for a radius search as `lat,lng`. Requires `radius`. */
  location?: string;
  /** Search radius in metres. Requires `location`. */
  radius?: number;
  /** Polygon spatial anchor as `way/<id>` or `relation/<id>`. Mutually exclusive with `bbox` / `location`. */
  within?: string;
  osmIds?: string;
  minLengthM?: number;
  maxLengthM?: number;
  minAreaM2?: number;
  maxAreaM2?: number;
  disableBudgetWarning?: boolean;
  /** When true, include `properties.centroid` on non-point features. Omit for the API default (false). */
  centroid?: boolean;
  /** When true, clip returned geometry to the requested bbox. Omit for the API default (false). */
  clipGeometry?: boolean;
  /** Accept media type. Default application/geo+json; other types put bytes in ``data``. */
  accept?: string;
};

/** `GET /v2/osm_features/stats`. Same filters as `query` except paging/geometry extras. */
export type OSMFeaturesStatsParams = {
  /** Tag key to group on (required). Features without this key are not counted. */
  groupBy: string;
  bbox?: string;
  location?: string;
  radius?: number;
  within?: string;
  type?: string;
  wayShape?: 'line' | 'polygon' | 'all';
  /** @deprecated Use `wayShape`. */
  shape?: 'line' | 'polygon' | 'all';
  tags?: string[];
  orTags?: string[];
  notTags?: string[];
  /** Max histogram buckets (API default 100, max 10000). Does not cap the scan. */
  limit?: number;
  minLengthM?: number;
  maxLengthM?: number;
  minAreaM2?: number;
  maxAreaM2?: number;
  disableBudgetWarning?: boolean;
};

export type OSMStatsGroup = { value: string; count: number };

export type OSMStatsResponse = {
  groups: OSMStatsGroup[];
  total: number;
  truncated: boolean;
};

type QueryValue = unknown;
export type OSMFeaturesQuery = Record<string, QueryValue>;

/** Routing point. Accepts ``lon`` or ``lng``. */
export type LonLat = { lat: number } & ({ lon: number } | { lng: number });
export type RouteTravelMode = 'WALK' | 'BICYCLE';

export type RoutesIsochroneParams = {
  origin: LonLat;
  maxDistanceM?: number;
  durationS?: number;
  searchBufferM?: number;
  travelMode?: RouteTravelMode;
};

export type RoutesPathParams = {
  stops: LonLat[];
  searchBufferM?: number;
  travelMode?: RouteTravelMode;
};

export type RoutesOptimizedPathParams = {
  start: LonLat;
  stops: LonLat[];
  searchBufferM?: number;
  loop?: boolean;
  travelMode?: RouteTravelMode;
};

export type PlacesSearchParams = {
  bbox?: string;
  location?: LonLat;
  radius?: number;
  type?: string;
  tags?: string[];
  orTags?: string[];
  limit?: number;
  /** Keep only places known open at ``asOf`` (or now). Untagged hours are dropped. */
  openNow?: boolean;
  asOf?: string;
};

export type PlacesNearbyParams = {
  location: LonLat;
  radius?: number;
  type?: string;
  tags?: string[];
  orTags?: string[];
  limit?: number;
  /** Keep only places known open at ``asOf`` (or now). Untagged hours are dropped. */
  openNow?: boolean;
  asOf?: string;
};

/**
 * Place GeoJSON ``properties`` from search / nearby / details.
 * ``openNow`` is true/false when hours are evaluable at ``asOf`` (or now);
 * omitted when missing or unparseable.
 */
export type PlaceProperties = {
  tags?: Record<string, unknown>;
  openNow?: boolean;
  centroid?: unknown;
};

export type PlaceFeatureLike = {
  properties?: PlaceProperties | Record<string, unknown>;
  /** ``places_details`` envelope: ``{ status, feature }``. */
  feature?: PlaceFeatureLike;
};

function openNowValue(feature: PlaceFeatureLike | undefined): unknown {
  if (feature == null) {
    return undefined;
  }
  const props = feature.properties;
  if (props && typeof props === 'object' && 'openNow' in props) {
    return props['openNow'];
  }
  if (feature.feature != null && feature.feature !== feature) {
    return openNowValue(feature.feature);
  }
  return undefined;
}

/** ``properties.openNow === true`` (known open). Missing / non-boolean is not open. Unwraps ``{ feature }``. */
export function isOpenNow(feature: PlaceFeatureLike | undefined): boolean {
  return openNowValue(feature) === true;
}

/** ``true`` / ``false`` when hours are known; ``undefined`` when the field is omitted. Unwraps ``{ feature }``. */
export function readOpenNow(feature: PlaceFeatureLike | undefined): boolean | undefined {
  const value = openNowValue(feature);
  return typeof value === 'boolean' ? value : undefined;
}

export type PlacesDetailsParams = {
  /** ``node`` / ``way`` / ``relation``, or a full ``node/123`` feature id. */
  osmType: string;
  osmId?: number | string;
};

const PLACE_TYPES = new Set(['node', 'way', 'relation']);

type OSMFeaturesDependencies = {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
};

const DEFAULT_BASE_URL = 'https://api.maplark.com';
const MAX_LIMIT = 6000;
const GEOJSON_ACCEPT = 'application/geo+json';

function isGeojsonAccept(accept: string | undefined): boolean {
  if (accept == null || accept.trim() === '') {
    return true;
  }
  const media = accept.split(',', 1)[0].split(';', 1)[0].trim().toLowerCase();
  return media === '*/*' || media === '*' || media === GEOJSON_ACCEPT;
}

function appError(status: number, code: string, detail: string, subtype?: string): AppError {
  const err = createHttpError(status, detail) as AppError;
  err.code = code;
  err.subtype = subtype;
  return err;
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
}

function optionalString(query: OSMFeaturesQuery, key: string): string | undefined {
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

function optionalNumber(query: OSMFeaturesQuery, key: string): number | undefined {
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

function optionalBoolean(query: OSMFeaturesQuery, key: string): boolean | undefined {
  const raw = query[key];
  if (raw == null || raw === '') {
    return undefined;
  }
  if (typeof raw === 'boolean') {
    return raw;
  }
  const text = String(Array.isArray(raw) ? raw[0] : raw).trim().toLowerCase();
  if (text === 'true' || text === '1') {
    return true;
  }
  if (text === 'false' || text === '0') {
    return false;
  }
  return undefined;
}

function stringList(query: OSMFeaturesQuery, key: string): string[] {
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

function queryFromSearchParams(params: URLSearchParams): OSMFeaturesQuery {
  const out: OSMFeaturesQuery = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length <= 1 ? (all[0] ?? '') : all;
  }
  return out;
}

function asQueryMap(query: OSMFeaturesQuery | URLSearchParams): OSMFeaturesQuery {
  return query instanceof URLSearchParams ? queryFromSearchParams(query) : query;
}

function parseLimit(query: OSMFeaturesQuery): number | undefined {
  const raw = optionalString(query, 'limit');
  if (raw == null) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  if (parsed > MAX_LIMIT) {
    throw appError(400, 'invalid_limit', `limit must be <= ${MAX_LIMIT}.`);
  }
  return parsed;
}

/** Parse `bbox_tiles` from a query map for `query_all` (client-side only). */
export function resolveBboxTiles(query: OSMFeaturesQuery = {}, fallback: number = 2): number {
  const raw = optionalString(query, 'bbox_tiles');
  if (raw == null) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || !isPowerOfTwo(parsed)) {
    throw appError(
      400,
      'invalid_bbox_tiles',
      'bbox_tiles must be a power of 2 (1, 2, 4, 8, …).',
    );
  }
  return parsed;
}

/** Split bbox into `tileCount` tiles by repeated longest-side bisection. */
export function splitBbox(bbox: string, tileCount: number): string[] {
  if (!isPowerOfTwo(tileCount)) {
    throw appError(
      400,
      'invalid_bbox_tiles',
      'bbox_tiles must be a power of 2 (1, 2, 4, 8, …).',
    );
  }

  const parts = bbox.split(',').map((value) => Number.parseFloat(value.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw appError(400, 'invalid_bbox', 'bbox must be min_lon,min_lat,max_lon,max_lat.');
  }

  let tiles: Array<[number, number, number, number]> = [
    [parts[0]!, parts[1]!, parts[2]!, parts[3]!],
  ];

  while (tiles.length < tileCount) {
    const next: Array<[number, number, number, number]> = [];
    for (const [minLon, minLat, maxLon, maxLat] of tiles) {
      const lonSpan = maxLon - minLon;
      const latSpan = maxLat - minLat;
      if (lonSpan >= latSpan) {
        const midLon = minLon + lonSpan / 2;
        next.push([minLon, minLat, midLon, maxLat], [midLon, minLat, maxLon, maxLat]);
      } else {
        const midLat = minLat + latSpan / 2;
        next.push([minLon, minLat, maxLon, midLat], [minLon, midLat, maxLon, maxLat]);
      }
    }
    tiles = next;
  }

  return tiles.map(([minLon, minLat, maxLon, maxLat]) =>
    `${minLon},${minLat},${maxLon},${maxLat}`);
}

type RawQueryParams = {
  bbox?: string;
  limit?: number;
  cursor?: string;
  zoom?: number;
  location?: string;
  radius?: number;
  within?: string;
  groupBy?: string;
  osmIds?: string;
  minLengthM?: number;
  maxLengthM?: number;
  minAreaM2?: number;
  maxAreaM2?: number;
  disableBudgetWarning?: boolean;
  centroid?: boolean;
  clipGeometry?: boolean;
  accept?: string;
  type?: string;
  wayShape?: string;
  /** @deprecated Use `wayShape`. */
  shape?: string;
  tags?: string[];
  orTags?: string[];
  notTags?: string[];
};

function buildFeaturesQuery(params: RawQueryParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.bbox) {
    query.set('bbox', params.bbox);
  }
  if (params.limit != null) {
    query.set('limit', String(params.limit));
  }
  if (params.cursor) {
    query.set('cursor', params.cursor);
  }
  if (params.zoom != null) {
    query.set('zoom', String(params.zoom));
  }
  if (params.location) {
    query.set('location', params.location);
  }
  if (params.radius != null) {
    query.set('radius', String(params.radius));
  }
  if (params.within) {
    query.set('within', params.within);
  }
  if (params.groupBy) {
    query.set('group_by', params.groupBy);
  }
  if (params.osmIds) {
    query.set('osm_ids', params.osmIds);
  }
  if (params.minLengthM != null) {
    query.set('min_length_m', String(params.minLengthM));
  }
  if (params.maxLengthM != null) {
    query.set('max_length_m', String(params.maxLengthM));
  }
  if (params.minAreaM2 != null) {
    query.set('min_area_m2', String(params.minAreaM2));
  }
  if (params.maxAreaM2 != null) {
    query.set('max_area_m2', String(params.maxAreaM2));
  }
  if (params.disableBudgetWarning) {
    query.set('disable_budget_warning', String(params.disableBudgetWarning));
  }
  if (params.centroid) {
    query.set('centroid', String(params.centroid));
  }
  if (params.clipGeometry != null) {
    query.set('clipGeometry', String(params.clipGeometry));
  }
  if (params.type) {
    query.set('type', params.type);
  }
  const wayShape = params.wayShape ?? params.shape;
  if (wayShape) {
    query.set('way_shape', wayShape);
  }
  for (const tag of params.tags ?? []) {
    query.append('tags', tag);
  }
  for (const tag of params.orTags ?? []) {
    query.append('or_tags', tag);
  }
  for (const tag of params.notTags ?? []) {
    query.append('not_tags', tag);
  }
  return query;
}

function lonlat(point: LonLat): { lon: number; lat: number } {
  const lon = 'lon' in point ? point.lon : point.lng;
  return { lon, lat: point.lat };
}

function latlng(point: LonLat): { lat: number; lng: number } {
  const lng = 'lng' in point ? point.lng : point.lon;
  return { lat: point.lat, lng };
}

function parsePlaceRef(osmType: string, osmId?: number | string): { osmType: string; osmId: number } {
  if (osmId == null) {
    const raw = osmType.trim();
    const slash = raw.indexOf('/');
    if (slash < 0) {
      throw appError(400, 'invalid_place_id', 'place id must be node|way|relation plus a positive osm_id');
    }
    return parsePlaceRef(raw.slice(0, slash), raw.slice(slash + 1));
  }
  const kind = osmType.trim().toLowerCase();
  if (!PLACE_TYPES.has(kind)) {
    throw appError(400, 'invalid_place_id', 'osm_type must be node, way, or relation');
  }
  const n = typeof osmId === 'number' ? osmId : Number.parseInt(String(osmId).trim(), 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw appError(400, 'invalid_place_id', 'osm_id must be a positive integer');
  }
  return { osmType: kind, osmId: n };
}

function placesSearchBody(params: PlacesSearchParams): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (params.bbox != null) {
    body['bbox'] = params.bbox;
  }
  if (params.location != null) {
    body['location'] = latlng(params.location);
  }
  if (params.radius != null) {
    body['radius'] = params.radius;
  }
  if (params.type != null) {
    body['type'] = params.type;
  }
  if (params.tags?.length) {
    body['tags'] = params.tags;
  }
  if (params.orTags?.length) {
    body['orTags'] = params.orTags;
  }
  if (params.limit != null) {
    body['limit'] = params.limit;
  }
  if (params.openNow) {
    body['openNow'] = true;
  }
  if (params.asOf != null) {
    body['asOf'] = params.asOf;
  }
  return body;
}

function placesNearbyBody(params: PlacesNearbyParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    location: latlng(params.location),
  };
  if (params.radius != null) {
    body['radius'] = params.radius;
  }
  if (params.type != null) {
    body['type'] = params.type;
  }
  if (params.tags?.length) {
    body['tags'] = params.tags;
  }
  if (params.orTags?.length) {
    body['orTags'] = params.orTags;
  }
  if (params.limit != null) {
    body['limit'] = params.limit;
  }
  if (params.openNow) {
    body['openNow'] = true;
  }
  if (params.asOf != null) {
    body['asOf'] = params.asOf;
  }
  return body;
}

function routesIsochroneBody(params: RoutesIsochroneParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    origin: lonlat(params.origin),
  };
  if (params.maxDistanceM != null) {
    body['max_distance_m'] = params.maxDistanceM;
  }
  if (params.durationS != null) {
    body['duration_s'] = params.durationS;
  }
  if (params.searchBufferM != null) {
    body['search_buffer_m'] = params.searchBufferM;
  }
  if (params.travelMode != null) {
    body['travelMode'] = params.travelMode;
  }
  return body;
}

function routesPathBody(params: RoutesPathParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    stops: params.stops.map(lonlat),
  };
  if (params.searchBufferM != null) {
    body['search_buffer_m'] = params.searchBufferM;
  }
  if (params.travelMode != null) {
    body['travelMode'] = params.travelMode;
  }
  return body;
}

function routesOptimizedPathBody(params: RoutesOptimizedPathParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    start: lonlat(params.start),
    stops: params.stops.map(lonlat),
  };
  if (params.loop != null) {
    body['loop'] = params.loop;
  }
  if (params.searchBufferM != null) {
    body['search_buffer_m'] = params.searchBufferM;
  }
  if (params.travelMode != null) {
    body['travelMode'] = params.travelMode;
  }
  return body;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function featureKey(feature: unknown, index: number): string {
  if (feature && typeof feature === 'object') {
    const record = feature as Record<string, unknown>;
    if (record['id'] != null) {
      return String(record['id']);
    }
    const props = record['properties'];
    if (props && typeof props === 'object') {
      const p = props as Record<string, unknown>;
      if (p['osm_type'] != null && p['osm_id'] != null) {
        return `${String(p['osm_type'])}/${String(p['osm_id'])}`;
      }
    }
  }
  return `fallback-${index}`;
}

function dedupeFeatures(features: unknown[]): unknown[] {
  const seen = new Set<string>();
  const deduped: unknown[] = [];
  for (let index = 0; index < features.length; index += 1) {
    const key = featureKey(features[index], index);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(features[index]);
  }
  return deduped;
}

async function readUpstreamErrorDetail(upstream: globalThis.Response): Promise<string | undefined> {
  try {
    const rawBody = await upstream.text();
    if (rawBody !== '') {
      return rawBody;
    }
  } catch {
    // Fall through to status text.
  }
  return upstream.statusText || undefined;
}

export class OSMFeatures {
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;

  constructor(
    apiKey: string,
    {
      apiBaseUrl = DEFAULT_BASE_URL,
      timeoutMs = 30_000,
      retryAttempts = 3,
      retryBaseMs = 750,
      retryMaxMs = 15_000,
    }: {
      apiBaseUrl?: string;
      timeoutMs?: number;
      retryAttempts?: number;
      retryBaseMs?: number;
      retryMaxMs?: number;
    } = {},
  ) {
    this.apiKey = apiKey;
    this.apiBaseUrl = apiBaseUrl;
    this.timeoutMs = timeoutMs;
    this.retryAttempts = retryAttempts;
    this.retryBaseMs = retryBaseMs;
    this.retryMaxMs = retryMaxMs;
  }

  /** Map Express/query params + resolved layer into flat `query` / `query_all` params. */
  resolveRequest(query: OSMFeaturesQuery, layer: OSMFeaturesLayer): OSMFeaturesParams {
    return {
      ...layer,
      limit: parseLimit(query),
      cursor: optionalString(query, 'cursor'),
      zoom: optionalNumber(query, 'zoom'),
      location: optionalString(query, 'location'),
      radius: optionalNumber(query, 'radius'),
      within: optionalString(query, 'within'),
      osmIds: optionalString(query, 'osm_ids'),
      minLengthM: optionalNumber(query, 'min_length_m'),
      maxLengthM: optionalNumber(query, 'max_length_m'),
      minAreaM2: optionalNumber(query, 'min_area_m2'),
      maxAreaM2: optionalNumber(query, 'max_area_m2'),
      disableBudgetWarning: optionalBoolean(query, 'disable_budget_warning'),
      centroid: optionalBoolean(query, 'centroid'),
      clipGeometry: optionalBoolean(query, 'clipGeometry'),
    };
  }

  /** Map Express/query params into `stats` params. `group_by` is required. */
  resolveStatsRequest(query: OSMFeaturesQuery | URLSearchParams): OSMFeaturesStatsParams {
    const q = asQueryMap(query);
    const groupBy = optionalString(q, 'group_by');
    if (groupBy == null) {
      throw appError(400, 'invalid_group_by', 'group_by is required.');
    }
    const tags = stringList(q, 'tags');
    const orTags = stringList(q, 'or_tags');
    const notTags = stringList(q, 'not_tags');
    const wayShapeRaw = optionalString(q, 'way_shape') ?? optionalString(q, 'shape');
    const wayShape =
      wayShapeRaw === 'line' || wayShapeRaw === 'polygon' || wayShapeRaw === 'all'
        ? wayShapeRaw
        : undefined;
    const params: OSMFeaturesStatsParams = { groupBy };
    const bbox = optionalString(q, 'bbox');
    if (bbox) params.bbox = bbox;
    const within = optionalString(q, 'within');
    if (within) params.within = within;
    const location = optionalString(q, 'location');
    if (location) params.location = location;
    const radius = optionalNumber(q, 'radius');
    if (radius != null) params.radius = radius;
    const type = optionalString(q, 'type');
    if (type) params.type = type;
    if (wayShape) params.wayShape = wayShape;
    if (tags.length > 0) params.tags = tags;
    if (orTags.length > 0) params.orTags = orTags;
    if (notTags.length > 0) params.notTags = notTags;
    const limit = optionalNumber(q, 'limit');
    if (limit != null && Number.isFinite(limit)) params.limit = Math.trunc(limit);
    const minLengthM = optionalNumber(q, 'min_length_m');
    if (minLengthM != null) params.minLengthM = minLengthM;
    const maxLengthM = optionalNumber(q, 'max_length_m');
    if (maxLengthM != null) params.maxLengthM = maxLengthM;
    const minAreaM2 = optionalNumber(q, 'min_area_m2');
    if (minAreaM2 != null) params.minAreaM2 = minAreaM2;
    const maxAreaM2 = optionalNumber(q, 'max_area_m2');
    if (maxAreaM2 != null) params.maxAreaM2 = maxAreaM2;
    const disableBudgetWarning = optionalBoolean(q, 'disable_budget_warning');
    if (disableBudgetWarning) params.disableBudgetWarning = true;
    return params;
  }

  private async throwUpstreamError(upstream: globalThis.Response): Promise<never> {
    const subtype = upstream.status === 429 ? 'upstream_rate_limit' : undefined;
    const upstreamDetail = await readUpstreamErrorDetail(upstream);
    const detail = upstreamDetail
      ? `Server returned status ${upstream.status}. Details: ${upstreamDetail}`
      : `Server returned status ${upstream.status}.`;
    const err = appError(upstream.status, 'upstream_status', detail, subtype);
    err.upstreamStatus = upstream.status;
    err.upstreamDetail = upstreamDetail;
    throw err;
  }

  /** GET/POST with 429 retry. Throws on non-OK. */
  private async _fetchOk(
    url: string,
    init: RequestInit,
    fetchFn: typeof fetch,
    sleepFn: (ms: number) => Promise<void>,
    nowFn: () => number,
  ): Promise<globalThis.Response> {
    let retryAttempt = 0;
    while (true) {
      let upstream: globalThis.Response;
      try {
        upstream = await fetchFn(url, {
          ...init,
          signal: init.signal ?? AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        const subtype = error instanceof DOMException && error.name === 'TimeoutError'
          ? 'upstream_timeout'
          : 'upstream_network';
        const err = appError(502, 'upstream_error', 'OSM features upstream request failed.', subtype);
        (err as AppError & { cause?: unknown }).cause = error;
        throw err;
      }

      if (upstream.ok) {
        return upstream;
      }

      if (upstream.status === 429 && retryAttempt < this.retryAttempts) {
        retryAttempt += 1;
        const retryAfterHeader = upstream.headers.get('retry-after');
        const fallbackMs = Math.min(
          this.retryMaxMs,
          this.retryBaseMs * (2 ** Math.max(0, retryAttempt - 1)),
        );
        let waitMs = fallbackMs;
        if (retryAfterHeader) {
          const asSeconds = Number.parseFloat(retryAfterHeader);
          if (Number.isFinite(asSeconds) && asSeconds >= 0) {
            waitMs = Math.min(this.retryMaxMs, Math.max(0, Math.round(asSeconds * 1000)));
          } else {
            const asDateMs = Date.parse(retryAfterHeader);
            if (!Number.isNaN(asDateMs)) {
              const deltaMs = asDateMs - nowFn();
              if (deltaMs > 0) {
                waitMs = Math.min(this.retryMaxMs, deltaMs);
              }
            }
          }
        }
        // ponytail: simple stderr-visible warning for 429 retries; upgrade to injected logger if consumers need structured logs.
        console.warn(
          `[osmfeatures] Upstream returned 429; retry ${retryAttempt}/${this.retryAttempts} in ${Math.round(waitMs)}ms.`,
        );
        await sleepFn(waitMs);
        continue;
      }

      await this.throwUpstreamError(upstream);
    }
  }

  /** POST JSON to a geo-agent path. */
  private async _postJson(
    path: string,
    body: Record<string, unknown>,
    fetchFn: typeof fetch,
    sleepFn: (ms: number) => Promise<void>,
    nowFn: () => number,
  ): Promise<Record<string, unknown>> {
    const upstream = await this._fetchOk(
      `${this.apiBaseUrl}${path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'osmfeatures',
        },
        body: JSON.stringify(body),
      },
      fetchFn,
      sleepFn,
      nowFn,
    );
    return (await upstream.json()) as Record<string, unknown>;
  }

  /** GET JSON from a geo-agent or account path. */
  private async _getJson(
    path: string,
    query: Record<string, string> | URLSearchParams,
    fetchFn: typeof fetch,
    sleepFn: (ms: number) => Promise<void>,
    nowFn: () => number,
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${this.apiBaseUrl}${path}`);
    const entries = query instanceof URLSearchParams ? query.entries() : Object.entries(query);
    for (const [key, value] of entries) {
      url.searchParams.append(key, value);
    }
    const upstream = await this._fetchOk(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'osmfeatures',
        },
      },
      fetchFn,
      sleepFn,
      nowFn,
    );
    return (await upstream.json()) as Record<string, unknown>;
  }

  /** Single HTTP request with retry. Throws on non-OK (same role as Python `_raw_query`). */
  private async _rawQuery(
    params: RawQueryParams,
    fetchFn: typeof fetch,
    sleepFn: (ms: number) => Promise<void>,
    nowFn: () => number,
  ): Promise<OSMFeaturesResult> {
    const query = buildFeaturesQuery(params);
    const upstreamUrl = new URL(`${this.apiBaseUrl}/v2/osm_features`);
    for (const [key, value] of query.entries()) {
      upstreamUrl.searchParams.append(key, value);
    }

    const upstream = await this._fetchOk(
      upstreamUrl.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: params.accept || GEOJSON_ACCEPT,
          'User-Agent': 'osmfeatures',
        },
      },
      fetchFn,
      sleepFn,
      nowFn,
    );

    if (isGeojsonAccept(params.accept)) {
      const body = (await upstream.json()) as OSMGeoJSONPayload;
      const features = Array.isArray(body.features) ? body.features : [];
      return resultFromFeatures(
        features,
        metaFromHeaders(upstream.headers, features.length),
      );
    }

    const bytes = await upstream.arrayBuffer();
    return {
      data: bytes,
      meta: metaFromHeaders(upstream.headers, 0),
    };
  }

  /** Single upstream page. Params map 1:1 to server query string (no tiling). */
  async query(
    {
      bbox,
      tags,
      orTags,
      notTags,
      type,
      wayShape,
      shape,
      limit,
      cursor,
      zoom,
      location,
      radius,
      within,
      osmIds,
      minLengthM,
      maxLengthM,
      minAreaM2,
      maxAreaM2,
      disableBudgetWarning,
      centroid,
      clipGeometry,
      accept,
    }: OSMFeaturesParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<OSMFeaturesResult> {
    const payload = await this._rawQuery(
      {
        bbox,
        tags,
        orTags,
        notTags,
        type,
        wayShape,
        shape,
        limit,
        cursor,
        zoom,
        location,
        radius,
        within,
        osmIds,
        minLengthM,
        maxLengthM,
        minAreaM2,
        maxAreaM2,
        disableBudgetWarning,
        centroid,
        clipGeometry,
        accept,
      },
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
    return payload;
  }

  /** Auto-paginate (and optionally tile) until complete. Each page uses `_rawQuery`. */
  async query_all(
    {
      bbox,
      tags,
      orTags,
      notTags,
      type,
      wayShape,
      shape,
      zoom,
      location,
      radius,
      within,
      osmIds,
      minLengthM,
      maxLengthM,
      minAreaM2,
      maxAreaM2,
      disableBudgetWarning,
      centroid,
      clipGeometry,
      accept,
      limitPerPage,
      bboxTiles = 2,
      maxPages = 15,
      maxFeatures = 55_000,
    }: Omit<OSMFeaturesParams, 'limit' | 'cursor'> & {
      /** Upstream `limit` per HTTP request (page size). Omit to use the API default (1000). */
      limitPerPage?: number;
      bboxTiles?: number;
      maxPages?: number;
      /** Cap on merged features. `null` = no cap. */
      maxFeatures?: number | null;
    },
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<OSMGeoJSONResult> {
    if (!isGeojsonAccept(accept)) {
      throw appError(
        400,
        'invalid_accept',
        'query_all only supports GeoJSON; use query({ accept }) for binary encodings.',
      );
    }
    if (!isPowerOfTwo(bboxTiles)) {
      throw appError(
        400,
        'invalid_bbox_tiles',
        'bbox_tiles must be a power of 2 (1, 2, 4, 8, …).',
      );
    }

    const fetchFn = dependencies.fetchFn ?? fetch;
    const sleepFn = dependencies.sleepFn ?? sleep;
    const nowFn = dependencies.nowFn ?? Date.now;
    const featureCap = maxFeatures == null ? Number.POSITIVE_INFINITY : maxFeatures;

    const tileBboxes = within || !bbox ? [undefined] : splitBbox(bbox, bboxTiles);
    const allFeatures: unknown[] = [];
    let pageCount = 0;
    let lastPage: OSMGeoJSONResult | null = null;
    let relayPartialReason: string | null = null;
    let lastCursor: string | null = null;
    let unitsCharged = 0;
    let sawUnitsCharged = false;
    // Cap / maxPages stop is intentional; this flag only marks result incomplete.
    let stoppedEarly = false;

    const baseParams = {
      tags,
      orTags,
      notTags,
      type,
      wayShape,
      shape,
      limit: limitPerPage,
      zoom,
      location,
      radius,
      within,
      osmIds,
      minLengthM,
      maxLengthM,
      minAreaM2,
      maxAreaM2,
      disableBudgetWarning,
      centroid,
      clipGeometry,
    };

    for (const tileBbox of tileBboxes) {
      if (allFeatures.length >= featureCap) {
        stoppedEarly = true;
        break;
      }
      if (relayPartialReason !== null) {
        break;
      }

      let cursor: string | undefined;
      let tilePages = 0;
      let tileExhausted = false;

      while (tilePages < maxPages && allFeatures.length < featureCap) {
        let page: OSMGeoJSONResult;
        try {
          const raw = await this._rawQuery(
            { ...baseParams, bbox: within ? undefined : tileBbox, cursor },
            fetchFn,
            sleepFn,
            nowFn,
          );
          if (raw.data instanceof ArrayBuffer) {
            throw appError(
              400,
              'invalid_accept',
              'query_all only supports GeoJSON; use query({ accept }) for binary encodings.',
            );
          }
          page = { data: raw.data, meta: raw.meta };
        } catch (error) {
          const status = (error as AppError).status;
          if (pageCount > 0 && (status === 400 || status === 429)) {
            relayPartialReason = status === 400
              ? 'upstream_rejected_cursor'
              : 'upstream_rate_limited_after_retries';
            break;
          }
          throw error;
        }

        const pageFeatures = Array.isArray(page.data.features)
          ? page.data.features
          : [];
        allFeatures.push(...pageFeatures);
        lastPage = page;
        pageCount += 1;
        tilePages += 1;
        if (page.meta.units_charged != null) {
          unitsCharged += page.meta.units_charged;
          sawUnitsCharged = true;
        }

        const hasMore = page.meta.has_more;
        const nextCursor = page.meta.next_cursor;
        if (!hasMore || typeof nextCursor !== 'string' || nextCursor === '') {
          lastCursor = typeof nextCursor === 'string' ? nextCursor : null;
          tileExhausted = true;
          break;
        }

        cursor = nextCursor;
        lastCursor = nextCursor;
      }

      if (relayPartialReason !== null) {
        break;
      }
      if (!tileExhausted) {
        stoppedEarly = true;
        if (allFeatures.length >= featureCap) {
          break;
        }
      }
    }

    const uniqueFeatures = dedupeFeatures(allFeatures);
    const truncated = Number.isFinite(featureCap) && uniqueFeatures.length > featureCap;
    const features = truncated ? uniqueFeatures.slice(0, featureCap) : uniqueFeatures;
    const incomplete = truncated || stoppedEarly;

    const meta: OSMFeaturesMeta = {
      returned: features.length,
      page_count: pageCount,
      has_more: incomplete || Boolean(lastPage?.meta.has_more) || relayPartialReason !== null,
      next_cursor: incomplete ? lastCursor : (lastPage?.meta.next_cursor ?? null),
      relay_partial: relayPartialReason !== null,
      relay_partial_reason: relayPartialReason ?? undefined,
    };
    if (sawUnitsCharged) {
      meta.units_charged = unitsCharged;
    }
    return resultFromFeatures(features, meta);
  }

  /** Count features grouped by a tag key (``GET /v2/osm_features/stats``). */
  async stats(
    params: OSMFeaturesStatsParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<OSMStatsResponse> {
    if (!params.groupBy) {
      throw appError(400, 'invalid_group_by', 'group_by is required.');
    }
    const body = await this._getJson(
      '/v2/osm_features/stats',
      buildFeaturesQuery({
        bbox: params.bbox,
        tags: params.tags,
        orTags: params.orTags,
        notTags: params.notTags,
        type: params.type,
        wayShape: params.wayShape ?? params.shape,
        limit: params.limit,
        location: params.location,
        radius: params.radius,
        within: params.within,
        groupBy: params.groupBy,
        minLengthM: params.minLengthM,
        maxLengthM: params.maxLengthM,
        minAreaM2: params.minAreaM2,
        maxAreaM2: params.maxAreaM2,
        disableBudgetWarning: params.disableBudgetWarning,
      }),
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
    return body as OSMStatsResponse;
  }

  /** Preflight credit cost (``GET /v2/osm_features/cost``). */
  async estimate_cost(
    params: OSMFeaturesParams = {},
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<Record<string, unknown>> {
    return this._getJson(
      '/v2/osm_features/cost',
      buildFeaturesQuery({
        bbox: params.bbox,
        tags: params.tags,
        orTags: params.orTags,
        notTags: params.notTags,
        type: params.type,
        wayShape: params.wayShape ?? params.shape,
        limit: params.limit,
        zoom: params.zoom,
        location: params.location,
        radius: params.radius,
        within: params.within,
        osmIds: params.osmIds,
        minLengthM: params.minLengthM,
        maxLengthM: params.maxLengthM,
        minAreaM2: params.minAreaM2,
        maxAreaM2: params.maxAreaM2,
        disableBudgetWarning: params.disableBudgetWarning,
        centroid: params.centroid,
        clipGeometry: params.clipGeometry,
      }),
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
  }

  /** This month's unit-budget usage (``GET /v1/usage``). */
  async usage(dependencies: OSMFeaturesDependencies = {}): Promise<Record<string, unknown>> {
    return this._getJson(
      '/v1/usage',
      {},
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
  }

  /** Find places in a bbox or radius (``POST /v1/places/search``). Features have ``properties.openNow`` when hours are known. */
  async places_search(
    params: PlacesSearchParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<Record<string, unknown>> {
    return this._postJson(
      '/v1/places/search',
      placesSearchBody(params),
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
  }

  /** Nearest places from a point (``POST /v1/places/nearby``). Features have ``properties.openNow`` when hours are known. */
  async places_nearby(
    params: PlacesNearbyParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<Record<string, unknown>> {
    return this._postJson(
      '/v1/places/nearby',
      placesNearbyBody(params),
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
  }

  /** One place by OSM id (``GET /v1/places/{osm_type}/{osm_id}``). Feature has ``properties.openNow`` when hours are known. */
  async places_details(
    params: PlacesDetailsParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<Record<string, unknown>> {
    const { osmType, osmId } = parsePlaceRef(params.osmType, params.osmId);
    return this._getJson(
      `/v1/places/${osmType}/${osmId}`,
      {},
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
  }

  /** Reach polygon along the walk/bike network (``POST /v1/routes/isochrone``). */
  async routes_isochrone(
    params: RoutesIsochroneParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<Record<string, unknown>> {
    return this._postJson(
      '/v1/routes/isochrone',
      routesIsochroneBody(params),
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
  }

  /** Given-order walk/bike path (``POST /v1/routes/path``). */
  async routes_path(
    params: RoutesPathParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<Record<string, unknown>> {
    return this._postJson(
      '/v1/routes/path',
      routesPathBody(params),
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
  }

  /** TSP walk/bike tour from ``start`` (``POST /v1/routes/optimized_path``). ``loop`` returns to start. */
  async routes_optimized_path(
    params: RoutesOptimizedPathParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<Record<string, unknown>> {
    return this._postJson(
      '/v1/routes/optimized_path',
      routesOptimizedPathBody(params),
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
  }
}

export * from './geojson-feature.js';
export * from './geometry.js';
export * from './nearest.js';
export * from './preset/index.js';
