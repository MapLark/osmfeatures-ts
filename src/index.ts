import createHttpError from 'http-errors';

type AppError = Error & {
  status?: number;
  code?: string;
  subtype?: string;
  units?: number;
  upstreamStatus?: number;
  upstreamDetail?: string;
  tiles?: number;
  maxTiles?: number;
  total?: number | null;
};

type UpstreamErrorBody = {
  detail?: string;
  subtype?: string;
  units?: number;
};

/** Response metadata (not part of GeoJSON body). */
export type OSMFeaturesMeta = {
  returned: number;
  /** True when the tile was truncated (``X-Has-More``). */
  has_more: boolean;
  /** Upstream HTTP response headers (includes ``X-Usage-Units-Charged`` when billed). */
  response_headers?: Record<string, string>;
};

/** Wire GeoJSON FeatureCollection. */
export type OSMGeoJSONPayload = {
  type: 'FeatureCollection';
  features: unknown[];
};

/** GeoJSON FeatureCollection body + client meta. */
export type OSMGeoJSONResult = {
  data: OSMGeoJSONPayload;
  meta: OSMFeaturesMeta;
};

/** GeoJSON FeatureCollection, or raw bytes in ``data`` for binary encodings. */
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

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function metaFromHeaders(headers: Headers, featureCount: number): OSMFeaturesMeta {
  const returnedRaw = headers.get('X-Returned');
  const parsed = returnedRaw != null && returnedRaw !== '' ? Number.parseInt(returnedRaw, 10) : Number.NaN;
  return {
    returned: Number.isFinite(parsed) ? parsed : featureCount,
    has_more: (headers.get('X-Has-More') ?? '').trim().toLowerCase() === 'true',
    response_headers: headersToRecord(headers),
  };
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
  /** Count-only (`autoSplit`). Not sent on `/v3/osm_features`. */
  disableBudgetWarning?: boolean;
  /** When true, include `properties.centroid` on non-point features. Omit for the API default (false). */
  centroid?: boolean;
  /** When true, clip returned geometry to the requested bbox. Omit for the API default (false). */
  clipGeometry?: boolean;
  /** Accept media type. Default application/geo+json; other types put bytes in ``data``. */
  accept?: string;
  /** Split the bbox into this many tiles (power of 2). Default 1. */
  bboxTiles?: number;
  /**
   * Count matches first, then fetch. Jumps to a power-of-2 tile grid when the
   * match set exceeds the key's `max_limit`, and jumps once more for one leftover
   * dense leaf. A bbox-area 400 jumps to that tile size (max 32 tiles).
   */
  autoSplit?: boolean;
  /** @deprecated Use `autoSplit`. */
  splitUntilFit?: boolean;
  /** Wall-clock seconds for this call. Default 60. `null` = no cap. */
  timeout?: number | null;
  /** Maximum features in the response. Omit for the key's max_limit. Client max 1000000. The API rejects above the key's max_limit. */
  limit?: number;
};

/** `GET /v2/osm_features/count`. Same filters as `query` except geometry extras. */
export type OSMFeaturesCountParams = {
  /** Tag key to group on. Omit for a scalar total (`groups` is empty). */
  groupBy?: string;
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

export type OSMCountGroup = { value: string; count: number };

export type OSMCountResponse = {
  groups: OSMCountGroup[];
  total: number;
  truncated: boolean;
  response_headers?: Record<string, string>;
};

/** `GET /v2/osm_features/density`. Same filters as `count` except no `groupBy`. */
export type OSMFeaturesDensityParams = {
  /** Grid cell size in degrees. Omit for the API default (0.1). */
  cellDeg?: number;
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
  /** Max occupied cells. Omit for the key's max_limit. */
  limit?: number;
  minLengthM?: number;
  maxLengthM?: number;
  minAreaM2?: number;
  maxAreaM2?: number;
  disableBudgetWarning?: boolean;
};

export type OSMDensityFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { count: number };
};

export type OSMDensityResponse = {
  type: 'FeatureCollection';
  features: OSMDensityFeature[];
  total: number;
  truncated: boolean;
  hint?: string;
  response_headers?: Record<string, string>;
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
  tags?: string[];
  orTags?: string[];
  limit?: number;
  /** Keep only places known open at ``asOf`` (or now). Untagged hours are dropped. */
  openNow?: boolean;
  asOf?: string;
  /** Split the bbox up front (power of 2). Bbox search only. */
  bboxTiles?: number;
  /** Count first (`way_shape=polygon`), then fetch. Bbox search only. Same walk as `query`. */
  autoSplit?: boolean;
  /** @deprecated Use `autoSplit`. */
  splitUntilFit?: boolean;
  /** Wall-clock seconds for a tiled search. Default 60. `null` = no cap. */
  timeout?: number | null;
};

export type PlacesNearbyParams = {
  location: LonLat;
  radius?: number;
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
/** HTTP timeout in ms. Above count/density statement timeout of 600s so a query_timeout JSON body arrives. */
export const DEFAULT_TIMEOUT_MS = 610_000;
const V3_PATH = '/v3/osm_features';
const ACCOUNT_TIER_PATH = '/v1/account/tier';
/** How long ``account_tier`` / ``autoSplit`` reuse ``GET /v1/account/tier``. */
const ACCOUNT_TIER_CACHE_MS = 5 * 60 * 1000;
// Enterprise TIER_LIMITS max_limit. The API rejects limit_exceeds_tier above the key.
const V3_MAX_LIMIT = 1_000_000;
// Hours-parse cap when places_search sends asOf/openNow. No-hours autoSplit
// uses GET /v1/account/tier max_limit instead.
const PLACES_MAX_LIMIT = 10_000;
// Five longest-side bisections. Density jumps the parent, then at most one leftover leaf.
const MAX_SPLIT_TILES = 32;
const MAX_DENSITY_JUMP_DEPTH = 1;
// Count never density-splits when the fetch cannot 400. Area 400s still split.
const NO_DENSITY_CAP = 2 ** 31 - 1;
// Search/query fetch 400s. Do not match "count bbox area".
const AREA_LIMIT_RE =
  /(?<!count )bbox area [0-9.]+\s+exceeds the (?:tagged )?tier limit ([0-9.]+)/i;

function resolveQueryLimit(limit: number | undefined): number | undefined {
  if (limit == null) {
    return undefined;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > V3_MAX_LIMIT) {
    throw appError(400, 'invalid_limit', `limit must be an integer from 1 to ${V3_MAX_LIMIT}`);
  }
  return limit;
}
const DEFAULT_QUERY_TIMEOUT_S = 60;
const METRES_PER_DEG_LAT = 111_320;
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

function optionalTimeout(query: OSMFeaturesQuery): number | null | undefined {
  const raw = query['timeout'];
  if (raw === null) {
    return null;
  }
  if (raw == null || raw === '') {
    return undefined;
  }
  const text = String(Array.isArray(raw) ? raw[0] : raw).trim().toLowerCase();
  if (text === 'null') {
    return null;
  }
  return optionalNumber(query, 'timeout');
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

function errorText(error: unknown): string {
  const err = error as AppError;
  return `${err.upstreamDetail ?? ''} ${err.message ?? ''} ${err.subtype ?? ''}`;
}

function isStatus400(error: unknown): boolean {
  return (error as AppError).status === 400;
}

function isResultTooLarge(error: unknown): boolean {
  return isStatus400(error) && errorText(error).includes('result_too_large');
}

function isHoursParseLimit(error: unknown): boolean {
  return isStatus400(error) && errorText(error).includes('hours_parse_limit');
}

function parseBboxAreaLimit(error: unknown): number | null {
  if (!isStatus400(error)) {
    return null;
  }
  const match = AREA_LIMIT_RE.exec(errorText(error));
  if (match == null) {
    return null;
  }
  const limit = Number.parseFloat(match[1] ?? '');
  return limit > 0 ? limit : null;
}

function nextPowerOfTwo(n: number): number {
  if (n <= 1) {
    return 1;
  }
  // `1 << k` is 32-bit and wraps (1<<32 === 1). `2 ** k` stays a JS number.
  return 2 ** (n - 1).toString(2).length;
}

function bboxAreaDeg2(bbox: string): number {
  const parts = bbox.split(',').map((value) => Number.parseFloat(value.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw appError(400, 'invalid_bbox', 'bbox must be min_lon,min_lat,max_lon,max_lat.');
  }
  return (parts[2]! - parts[0]!) * (parts[3]! - parts[1]!);
}

function tilesForMatchCount(total: number, tileCap: number): number {
  if (tileCap <= 0 || total <= tileCap) {
    return 1;
  }
  return nextPowerOfTwo(Math.ceil(total / tileCap));
}

function tileCountForMaxArea(bbox: string, maxTileArea: number, cap = 4096): number {
  const area = bboxAreaDeg2(bbox);
  if (maxTileArea <= 0 || area <= maxTileArea) {
    return 1;
  }
  return Math.min(nextPowerOfTwo(Math.ceil(area / maxTileArea)), nextPowerOfTwo(cap));
}

function maxLimitFromTier(tier: Record<string, unknown>): number {
  if (tier['max_limit'] == null) {
    throw new Error('GET /v1/account/tier must include max_limit');
  }
  const value = tier['max_limit'];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('tier max_limit must be an integer');
  }
  if (value < 1) {
    throw new Error('tier max_limit must be >= 1');
  }
  return value;
}

function matchSplitCap(limit: number | undefined, omitted: number): number {
  if (limit == null) {
    return omitted;
  }
  return Math.max(limit, omitted);
}

function hoursParseSplitCap(limit: number | undefined, openNow: boolean): number {
  if (openNow) {
    return PLACES_MAX_LIMIT;
  }
  if (limit != null && limit > PLACES_MAX_LIMIT) {
    return PLACES_MAX_LIMIT;
  }
  return NO_DENSITY_CAP;
}

function tooManyTilesMessage(needed: number, total?: number | null): string {
  const extra = total != null ? ` for ${total} matches` : '';
  return (
    `autoSplit needs ${needed} bbox tiles${extra} `
    + `(max ${MAX_SPLIT_TILES}). The area is too large to query. `
    + 'Geocode a smaller named place (city or neighborhood), or ask '
    + 'the user which area to use. Do not split the leftover bbox.'
  );
}

function tooDenseMessage(total?: number | null): string {
  const extra = total != null ? ` (${total} matches)` : '';
  return (
    `autoSplit cannot fetch this area: it is still too dense after a `
    + `power-of-2 jump${extra} (max ${MAX_SPLIT_TILES} tiles). Ask the user `
    + 'to shrink the area or add filters (more specific tags). If they do '
    + 'not answer, add tighter tags and retry a smaller named place.'
  );
}

function tileWalkError(
  code: 'too_many_tiles' | 'too_dense',
  detail: string,
  extra: { tiles?: number; maxTiles: number; total?: number | null },
): AppError {
  const err = new Error(detail) as AppError;
  err.code = code;
  err.maxTiles = extra.maxTiles;
  if (extra.tiles != null) {
    err.tiles = extra.tiles;
  }
  if (extra.total !== undefined) {
    err.total = extra.total;
  }
  return err;
}

/** `splitUntilFit` is the deprecated alias for `autoSplit`. */
function foldAutoSplit(autoSplit: boolean, splitUntilFit: boolean | undefined): boolean {
  if (splitUntilFit == null) {
    return autoSplit;
  }
  console.warn('[osmfeatures] splitUntilFit is deprecated; use autoSplit');
  if (autoSplit && autoSplit !== splitUntilFit) {
    throw new Error('autoSplit and deprecated splitUntilFit disagree. Pass only autoSplit.');
  }
  return splitUntilFit || autoSplit;
}

function presentText(value: string | undefined): boolean {
  return value != null && value !== '';
}

/** Same exclusivity rules as GET /v3/osm_features and /v2/osm_features/count. */
function assertExclusiveSpatial(params: {
  bbox?: string;
  location?: string;
  radius?: number;
  within?: string;
  osmIds?: string;
  tags?: string[];
  orTags?: string[];
  notTags?: string[];
}): void {
  const hasBbox = presentText(params.bbox);
  const hasLocation = presentText(params.location);
  const hasRadius = params.radius != null;
  const hasWithin = presentText(params.within);
  const hasOsmIds = presentText(params.osmIds);
  const hasTags = (params.tags?.length ?? 0) > 0
    || (params.orTags?.length ?? 0) > 0
    || (params.notTags?.length ?? 0) > 0;

  if (hasLocation !== hasRadius) {
    throw appError(
      400,
      'invalid_spatial',
      'location and radius must both be supplied together for a radius search.',
    );
  }
  const anchors = Number(hasBbox) + Number(hasLocation) + Number(hasWithin) + Number(hasOsmIds);
  if (anchors > 1) {
    throw appError(
      400,
      'invalid_spatial',
      'bbox, location+radius, within, and osmIds are mutually exclusive spatial anchors.',
    );
  }
  if (hasOsmIds && hasTags) {
    throw appError(
      400,
      'invalid_spatial',
      'osmIds is a direct ID lookup and cannot be combined with tag filters or spatial anchors.',
    );
  }
}

async function* iterSplitTiles<T>(options: {
  bbox: string;
  bboxTiles: number;
  autoSplit: boolean;
  timeout: number | null;
  nowFn: () => number;
  tileCap: number;
  matchCount: ((tile: string) => Promise<number>) | null;
  fetchTile: (tile: string) => Promise<T>;
  shouldStop?: () => boolean;
  overflowName: string;
}): AsyncGenerator<T> {
  const {
    bbox,
    bboxTiles,
    autoSplit,
    timeout,
    nowFn,
    tileCap,
    matchCount,
    fetchTile,
    shouldStop,
    overflowName,
  } = options;
  const deadline = timeout == null ? null : nowFn() + timeout * 1000;
  const tiles: Array<[string, number]> = splitBbox(bbox, bboxTiles).map((tile) => [tile, 0]);
  if (autoSplit && tiles.length > MAX_SPLIT_TILES) {
    throw tileWalkError(
      'too_many_tiles',
      tooManyTilesMessage(tiles.length),
      { tiles: tiles.length, maxTiles: MAX_SPLIT_TILES },
    );
  }
  let areaLimit: number | null = null;
  let lastTotal: number | null = null;
  let started = false;
  let fetched = 0;

  const deadlineCheck = (): void => {
    if (deadline != null && nowFn() >= deadline) {
      throw appError(408, 'query_timeout', `${overflowName} exceeded ${timeout}s timeout`);
    }
  };

  const raiseTooDense = (tilesNeeded?: number): never => {
    throw tileWalkError(
      'too_dense',
      tooDenseMessage(lastTotal),
      { maxTiles: MAX_SPLIT_TILES, tiles: tilesNeeded, total: lastTotal },
    );
  };

  const raiseTooMany = (tilesNeeded: number): never => {
    throw tileWalkError(
      'too_many_tiles',
      tooManyTilesMessage(tilesNeeded, lastTotal),
      { tiles: tilesNeeded, maxTiles: MAX_SPLIT_TILES, total: lastTotal },
    );
  };

  const enqueue = (
    children: string[],
    depth: number,
    overflow: (needed: number) => never,
  ): void => {
    const needed = fetched + tiles.length + children.length;
    if (needed > MAX_SPLIT_TILES) {
      overflow(needed);
    }
    const childDepth = depth + 1;
    for (const child of children) {
      tiles.push([child, childDepth]);
    }
  };

  const jumpDensity = (tile: string, depth: number, total: number): void => {
    if (depth > MAX_DENSITY_JUMP_DEPTH) {
      raiseTooDense();
    }
    const n = tilesForMatchCount(total, tileCap);
    if (n > MAX_SPLIT_TILES) {
      raiseTooDense(n);
    }
    enqueue(splitBbox(tile, n), depth, raiseTooDense);
  };

  const enqueueArea = (tile: string, depth: number, limit: number): boolean => {
    const n = tileCountForMaxArea(tile, limit);
    if (n <= 1) {
      return false;
    }
    if (n > MAX_SPLIT_TILES) {
      raiseTooMany(n);
    }
    enqueue(splitBbox(tile, n), depth, raiseTooMany);
    return true;
  };

  const onSplitError = (tile: string, depth: number, error: unknown): boolean => {
    const limit = parseBboxAreaLimit(error);
    if (limit != null) {
      areaLimit = limit;
      return enqueueArea(tile, depth, limit);
    }
    if (isHoursParseLimit(error)) {
      jumpDensity(tile, depth, Math.max(lastTotal ?? 0, tileCap) + 1);
      return true;
    }
    if (isResultTooLarge(error)) {
      raiseTooDense();
    }
    return false;
  };

  while (tiles.length > 0) {
    if (started) {
      deadlineCheck();
    }
    started = true;
    if (shouldStop?.()) {
      break;
    }
    const next = tiles.shift();
    if (next == null) {
      break;
    }
    const [tile, depth] = next;
    lastTotal = null;
    if (autoSplit && areaLimit != null && bboxAreaDeg2(tile) > areaLimit) {
      if (!enqueueArea(tile, depth, areaLimit)) {
        raiseTooDense();
      }
      continue;
    }
    if (autoSplit && matchCount != null) {
      let total: number;
      try {
        total = await matchCount(tile);
      } catch (error) {
        if (isStatus400(error) && onSplitError(tile, depth, error)) {
          continue;
        }
        throw error;
      }
      lastTotal = total;
      if (total === 0) {
        continue;
      }
      if (total > tileCap) {
        jumpDensity(tile, depth, total);
        continue;
      }
    }
    try {
      const page = await fetchTile(tile);
      fetched += 1;
      yield page;
    } catch (error) {
      if (autoSplit && isStatus400(error) && onSplitError(tile, depth, error)) {
        continue;
      }
      throw error;
    }
  }
}

/** Parse `bbox_tiles` / `bboxTiles` from a query map for `query` (client-side only). */
export function resolveBboxTiles(query: OSMFeaturesQuery = {}, fallback: number = 1): number {
  const raw = optionalString(query, 'bbox_tiles') ?? optionalString(query, 'bboxTiles');
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

/** Square bbox that fully contains a circle of `radiusM` around `lon, lat`. */
export function around_to_bbox(lon: number, lat: number, radiusM: number): string {
  const dlat = radiusM / METRES_PER_DEG_LAT;
  const dlon = radiusM / (METRES_PER_DEG_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 1e-9));
  return `${lon - dlon},${lat - dlat},${lon + dlon},${lat + dlat}`;
}

type RawQueryParams = {
  bbox?: string;
  /** v3 tile size (omit for API default, max 1000000) or count histogram bucket cap. */
  limit?: number;
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
  /** Density grid cell size in degrees. */
  cellDeg?: number;
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
  if (params.cellDeg != null) {
    query.set('cell_deg', String(params.cellDeg));
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

const PLACE_SUM_META_KEYS = ['units', 'input_count', 'kept_count', 'hours_parsed'] as const;

function mergeFeaturesById(lists: unknown[][]): unknown[] {
  const seen = new Set<string>();
  const merged: unknown[] = [];
  let fallback = 0;
  for (const list of lists) {
    for (const feat of list) {
      const raw = feat != null && typeof feat === 'object' && 'id' in feat && feat.id != null
        ? String(feat.id)
        : '';
      const id = raw !== '' ? raw : `fallback-${fallback}`;
      fallback += 1;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      merged.push(feat);
    }
  }
  return merged;
}

function mergePlaceMetadata(metas: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...metas[0] };
  delete out['hint'];
  for (const key of PLACE_SUM_META_KEYS) {
    let total = 0;
    let seen = false;
    for (const meta of metas) {
      const value = meta[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        continue;
      }
      total += Math.trunc(value);
      seen = true;
    }
    if (seen) {
      out[key] = total;
    }
  }
  if (metas.some((meta) => meta['hours_parse_capped'])) {
    out['hours_parse_capped'] = true;
  }
  return out;
}

function mergePlaceCollections(payloads: Record<string, unknown>[]): Record<string, unknown> {
  if (payloads.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  const features = mergeFeaturesById(
    payloads.map((payload) => (Array.isArray(payload['features']) ? payload['features'] : [])),
  );
  const out: Record<string, unknown> = { ...payloads[0] };
  out['type'] = 'FeatureCollection';
  out['features'] = features;
  const metas = payloads
    .map((payload) => payload['metadata'])
    .filter((meta): meta is Record<string, unknown> =>
      meta != null && typeof meta === 'object' && !Array.isArray(meta));
  if (metas.length > 0) {
    out['metadata'] = mergePlaceMetadata(metas);
  }
  return out;
}

async function readUpstreamError(upstream: globalThis.Response): Promise<UpstreamErrorBody> {
  try {
    const rawBody = await upstream.text();
    if (rawBody === '') {
      return { detail: upstream.statusText || undefined };
    }
    try {
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      const detail = typeof body.detail === 'string' ? body.detail : rawBody;
      const subtype = typeof body.subtype === 'string' ? body.subtype : undefined;
      const units = typeof body.units === 'number' && Number.isFinite(body.units)
        ? body.units
        : undefined;
      return { detail, subtype, units };
    } catch {
      return { detail: rawBody };
    }
  } catch {
    return { detail: upstream.statusText || undefined };
  }
}

function throwParsedUpstreamError(status: number, parsed: UpstreamErrorBody): never {
  const subtype = parsed.subtype ?? (status === 429 ? 'upstream_rate_limit' : undefined);
  const detail = parsed.detail
    ? `Server returned status ${status}. Details: ${parsed.detail}`
    : `Server returned status ${status}.`;
  const err = appError(status, 'upstream_status', detail, subtype);
  err.upstreamStatus = status;
  err.upstreamDetail = parsed.detail;
  if (parsed.units != null) {
    err.units = parsed.units;
  }
  throw err;
}

export class OSMFeatures {
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private accountTierCache: { body: Record<string, unknown>; expiresAt: number } | null = null;

  constructor(
    apiKey: string,
    {
      apiBaseUrl = DEFAULT_BASE_URL,
      timeoutMs = DEFAULT_TIMEOUT_MS,
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
  resolveRequest(query: OSMFeaturesQuery | URLSearchParams, layer: OSMFeaturesLayer): OSMFeaturesParams {
    const q = asQueryMap(query);
    const limit = optionalNumber(q, 'limit');
    const timeout = optionalTimeout(q);
    const bboxTilesRaw = optionalString(q, 'bbox_tiles') ?? optionalString(q, 'bboxTiles');
    const location = optionalString(q, 'location');
    const radius = optionalNumber(q, 'radius');
    const within = optionalString(q, 'within');
    const osmIds = optionalString(q, 'osm_ids');
    const params: OSMFeaturesParams = {
      ...layer,
      zoom: optionalNumber(q, 'zoom'),
      minLengthM: optionalNumber(q, 'min_length_m'),
      maxLengthM: optionalNumber(q, 'max_length_m'),
      minAreaM2: optionalNumber(q, 'min_area_m2'),
      maxAreaM2: optionalNumber(q, 'max_area_m2'),
      disableBudgetWarning: optionalBoolean(q, 'disable_budget_warning'),
      centroid: optionalBoolean(q, 'centroid'),
      clipGeometry: optionalBoolean(q, 'clipGeometry') ?? optionalBoolean(q, 'clip_geometry'),
      accept: optionalString(q, 'accept'),
      autoSplit: optionalBoolean(q, 'auto_split') ?? optionalBoolean(q, 'autoSplit'),
      splitUntilFit: optionalBoolean(q, 'split_until_fit') ?? optionalBoolean(q, 'splitUntilFit'),
    };
    if (osmIds != null) {
      delete params.bbox;
      delete params.tags;
      delete params.orTags;
      delete params.notTags;
      params.osmIds = osmIds;
    } else if (within != null) {
      delete params.bbox;
      params.within = within;
    } else if (location != null || radius != null) {
      delete params.bbox;
      if (location != null) params.location = location;
      if (radius != null) params.radius = radius;
    }
    if (limit != null) {
      params.limit = Math.trunc(limit);
    }
    if (timeout !== undefined) {
      params.timeout = timeout;
    }
    if (bboxTilesRaw != null) {
      params.bboxTiles = resolveBboxTiles({ bbox_tiles: bboxTilesRaw });
    }
    return params;
  }

  /** Map Express/query params into `count` params. Omit `group_by` for a scalar total. */
  resolveCountRequest(query: OSMFeaturesQuery | URLSearchParams): OSMFeaturesCountParams {
    const q = asQueryMap(query);
    const groupBy = optionalString(q, 'group_by');
    const tags = stringList(q, 'tags');
    const orTags = stringList(q, 'or_tags');
    const notTags = stringList(q, 'not_tags');
    const wayShapeRaw = optionalString(q, 'way_shape') ?? optionalString(q, 'shape');
    const wayShape =
      wayShapeRaw === 'line' || wayShapeRaw === 'polygon' || wayShapeRaw === 'all'
        ? wayShapeRaw
        : undefined;
    const params: OSMFeaturesCountParams = {};
    if (groupBy) params.groupBy = groupBy;
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

  /** Map Express/query params into `density` params. Omit `cell_deg` for 0.1. */
  resolveDensityRequest(query: OSMFeaturesQuery | URLSearchParams): OSMFeaturesDensityParams {
    const q = asQueryMap(query);
    const tags = stringList(q, 'tags');
    const orTags = stringList(q, 'or_tags');
    const notTags = stringList(q, 'not_tags');
    const wayShapeRaw = optionalString(q, 'way_shape') ?? optionalString(q, 'shape');
    const wayShape =
      wayShapeRaw === 'line' || wayShapeRaw === 'polygon' || wayShapeRaw === 'all'
        ? wayShapeRaw
        : undefined;
    const params: OSMFeaturesDensityParams = {};
    const cellDeg = optionalNumber(q, 'cell_deg');
    if (cellDeg != null && Number.isFinite(cellDeg)) params.cellDeg = cellDeg;
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
    throwParsedUpstreamError(upstream.status, await readUpstreamError(upstream));
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

      if (upstream.status === 429) {
        const parsed = await readUpstreamError(upstream);
        if (parsed.subtype === 'rate_limit_monthly' || retryAttempt >= this.retryAttempts) {
          throwParsedUpstreamError(upstream.status, parsed);
        }
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
  ): Promise<{ body: Record<string, unknown>; meta: OSMFeaturesMeta }> {
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
    const body = (await upstream.json()) as Record<string, unknown>;
    return { body, meta: metaFromHeaders(upstream.headers, 0) };
  }

  /** Single HTTP request with retry. Throws on non-OK (same role as Python `_raw_query`). */
  private async _rawQuery(
    params: RawQueryParams,
    fetchFn: typeof fetch,
    sleepFn: (ms: number) => Promise<void>,
    nowFn: () => number,
  ): Promise<OSMFeaturesResult> {
    const query = buildFeaturesQuery(params);
    const upstreamUrl = new URL(`${this.apiBaseUrl}${V3_PATH}`);
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

  /**
   * One ``/v3/osm_features`` call for a tile that fits in ``limit`` features.
   *
   * Omit ``limit`` for the key's ``max_limit``. A lower ``limit`` truncates
   * (``meta.has_more``). A match set larger than the caller's ``max_limit``
   * is HTTP 400 ``result_too_large``. ``autoSplit: true`` reads ``max_limit``
   * from ``GET /v1/account/tier``, counts first, and jumps to a power-of-2
   * tile grid when that match set exceeds the cap. A leftover dense leaf may
   * jump once more. ``autoSplit`` and ``bboxTiles`` require ``bbox``.
   * ``within``, radius, and ``osmIds`` cannot be split. ``splitUntilFit``
   * is a deprecated alias.
   */
  async query(
    params: OSMFeaturesParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<OSMFeaturesResult> {
    const {
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
      bboxTiles = 1,
      autoSplit: autoSplitParam = false,
      splitUntilFit,
      timeout = DEFAULT_QUERY_TIMEOUT_S,
      limit,
    } = params;
    const autoSplit = foldAutoSplit(autoSplitParam, splitUntilFit);
    assertExclusiveSpatial({
      bbox, location, radius, within, osmIds, tags, orTags, notTags,
    });
    const tileLimit = resolveQueryLimit(limit);
    let apiTruncated = false;
    const fetchFn = dependencies.fetchFn ?? fetch;
    const sleepFn = dependencies.sleepFn ?? sleep;
    const nowFn = dependencies.nowFn ?? Date.now;
    const filterParams: RawQueryParams = {
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
      centroid,
      clipGeometry,
      accept,
    };

    if (!isGeojsonAccept(accept)) {
      if (autoSplit) {
        throw appError(400, 'invalid_accept', 'autoSplit only works with GeoJSON');
      }
      if (bboxTiles !== 1) {
        throw appError(400, 'invalid_bbox_tiles', 'bboxTiles only works with GeoJSON');
      }
      return this._rawQuery(
        { ...filterParams, bbox, limit: tileLimit },
        fetchFn,
        sleepFn,
        nowFn,
      );
    }

    const finishGeojson = (raw: OSMFeaturesResult): OSMGeoJSONResult => {
      if (raw.data instanceof ArrayBuffer) {
        throw appError(400, 'invalid_accept', 'query expected GeoJSON');
      }
      const features = Array.isArray(raw.data.features) ? raw.data.features : [];
      return resultFromFeatures(features, {
        returned: features.length,
        has_more: raw.meta.has_more,
        response_headers: raw.meta.response_headers,
      });
    };

    if (typeof bbox !== 'string') {
      if (bboxTiles !== 1) {
        throw appError(400, 'invalid_bbox_tiles', 'bboxTiles requires bbox');
      }
      if (autoSplit) {
        throw appError(400, 'invalid_auto_split', 'autoSplit requires bbox');
      }
      return finishGeojson(
        await this._rawQuery(
          { ...filterParams, limit: tileLimit },
          fetchFn,
          sleepFn,
          nowFn,
        ),
      );
    }

    // autoSplit off: one GET. No count, no tile walk.
    if (!autoSplit && bboxTiles === 1) {
      return finishGeojson(
        await this._rawQuery(
          { ...filterParams, bbox, limit: tileLimit },
          fetchFn,
          sleepFn,
          nowFn,
        ),
      );
    }

    const fetchTile = async (tile: string): Promise<unknown[]> => {
      const raw = await this._rawQuery(
        { ...filterParams, bbox: tile, limit: tileLimit },
        fetchFn,
        sleepFn,
        nowFn,
      );
      if (raw.data instanceof ArrayBuffer) {
        throw appError(400, 'invalid_accept', 'query expected GeoJSON');
      }
      if (raw.meta.has_more) {
        apiTruncated = true;
      }
      return Array.isArray(raw.data.features) ? raw.data.features : [];
    };

    const matchCount = async (tile: string): Promise<number> => {
      const stat: OSMFeaturesCountParams = { bbox: tile };
      if (type != null) stat.type = type;
      if (tags != null) stat.tags = tags;
      if (orTags != null) stat.orTags = orTags;
      if (notTags != null) stat.notTags = notTags;
      if (minLengthM != null) stat.minLengthM = minLengthM;
      if (maxLengthM != null) stat.maxLengthM = maxLengthM;
      if (minAreaM2 != null) stat.minAreaM2 = minAreaM2;
      if (maxAreaM2 != null) stat.maxAreaM2 = maxAreaM2;
      const way = wayShape ?? shape;
      if (way != null) stat.wayShape = way;
      if (disableBudgetWarning) stat.disableBudgetWarning = true;
      const body = await this.count(stat, { fetchFn, sleepFn, nowFn });
      if (typeof body.total !== 'number' || !Number.isFinite(body.total)) {
        throw new Error('count response must include total');
      }
      return Math.trunc(body.total);
    };

    let tileCap = 1;
    if (autoSplit) {
      const tier = await this.account_tier({ fetchFn, sleepFn, nowFn });
      tileCap = matchSplitCap(tileLimit, maxLimitFromTier(tier));
    }

    const featureLists: unknown[][] = [];
    for await (const tileFeatures of iterSplitTiles({
      bbox,
      bboxTiles,
      autoSplit,
      timeout,
      nowFn,
      tileCap,
      matchCount: autoSplit ? matchCount : null,
      fetchTile,
      overflowName: 'query',
    })) {
      featureLists.push(tileFeatures);
    }

    const allFeatures = dedupeFeatures(featureLists.flat());
    return resultFromFeatures(allFeatures, {
      returned: allFeatures.length,
      has_more: apiTruncated,
    });
  }

  /** Same as ``query``. */
  async query_all(
    params: OSMFeaturesParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<OSMFeaturesResult> {
    return this.query(params, dependencies);
  }

  /** Count features, optionally grouped by a tag key (``GET /v2/osm_features/count``). */
  async count(
    params: OSMFeaturesCountParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<OSMCountResponse> {
    assertExclusiveSpatial({
      bbox: params.bbox,
      location: params.location,
      radius: params.radius,
      within: params.within,
      tags: params.tags,
      orTags: params.orTags,
      notTags: params.notTags,
    });
    const { body, meta } = await this._getJson(
      '/v2/osm_features/count',
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
    const out = body as OSMCountResponse;
    out.response_headers = meta.response_headers;
    return out;
  }

  /** Occupied grid bins (``GET /v2/osm_features/density``). Points with ``properties.count``, not OSM features. */
  async density(
    params: OSMFeaturesDensityParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<OSMDensityResponse> {
    assertExclusiveSpatial({
      bbox: params.bbox,
      location: params.location,
      radius: params.radius,
      within: params.within,
      tags: params.tags,
      orTags: params.orTags,
      notTags: params.notTags,
    });
    const { body, meta } = await this._getJson(
      '/v2/osm_features/density',
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
        cellDeg: params.cellDeg,
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
    const out = body as OSMDensityResponse;
    out.response_headers = meta.response_headers;
    return out;
  }

  /**
   * This API key's plan limits (``GET /v1/account/tier``). Cached for 5 minutes.
   * ``autoSplit`` uses ``max_limit`` as the density-split threshold.
   */
  async account_tier(
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<Record<string, unknown>> {
    const nowFn = dependencies.nowFn ?? Date.now;
    const cached = this.accountTierCache;
    if (cached != null && nowFn() < cached.expiresAt) {
      return { ...cached.body };
    }
    const { body } = await this._getJson(
      ACCOUNT_TIER_PATH,
      {},
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      nowFn,
    );
    this.accountTierCache = { body, expiresAt: nowFn() + ACCOUNT_TIER_CACHE_MS };
    return { ...body };
  }

  /** This month's unit-budget usage (``GET /v1/usage``). */
  async usage(dependencies: OSMFeaturesDependencies = {}): Promise<Record<string, unknown>> {
    const { body } = await this._getJson(
      '/v1/usage',
      {},
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
    return body;
  }

  /**
   * Find places in a bbox or radius (``POST /v1/places/search``).
   * Features have ``properties.openNow`` when hours are known.
   * ``metadata.units`` is credits charged. After ``bboxTiles`` / ``autoSplit``,
   * ``units`` is the sum of the search tiles.
   *
   * Places are nodes plus polygon POIs. There is no ``type`` filter (use
   * ``query()`` for OSM element type).
   * ``bboxTiles`` and ``autoSplit`` only apply to bbox search. ``autoSplit``
   * counts first via ``GET /v2/osm_features/count`` with ``way_shape=polygon``.
   * No hours: split on ``total`` vs the key's ``max_limit``. ``asOf`` / ``openNow``
   * AND ``opening_hours``. An ``asOf`` page ``limit`` truncates; density-split
   * vs the 10k parse cap only when ``limit`` is raised above 10k. ``openNow``
   * density-splits vs that 10k scan cap even with a small fill limit.
   * ``splitUntilFit`` is a deprecated alias for ``autoSplit``.
   */
  async places_search(
    params: PlacesSearchParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<Record<string, unknown>> {
    const fetchFn = dependencies.fetchFn ?? fetch;
    const sleepFn = dependencies.sleepFn ?? sleep;
    const nowFn = dependencies.nowFn ?? Date.now;
    const bboxTiles = params.bboxTiles ?? 1;
    const autoSplit = foldAutoSplit(params.autoSplit ?? false, params.splitUntilFit);
    const timeout = params.timeout === undefined ? DEFAULT_QUERY_TIMEOUT_S : params.timeout;
    if (bboxTiles !== 1 && typeof params.bbox !== 'string') {
      throw new Error('bboxTiles only applies to bbox search, not location+radius');
    }
    if (autoSplit && typeof params.bbox !== 'string') {
      throw new Error('autoSplit only applies to bbox search, not location+radius');
    }
    if (bboxTiles === 1 && !autoSplit) {
      return this._postJson('/v1/places/search', placesSearchBody(params), fetchFn, sleepFn, nowFn);
    }

    const bbox = params.bbox;
    if (typeof bbox !== 'string') {
      throw new Error('autoSplit only applies to bbox search, not location+radius');
    }
    const hoursOn = Boolean(params.openNow || params.asOf != null);
    const countTags = [...(params.tags ?? [])];
    if (hoursOn) {
      countTags.push('opening_hours');
    }
    let tileCap = 1;
    if (autoSplit && !hoursOn) {
      const tier = await this.account_tier({ fetchFn, sleepFn, nowFn });
      tileCap = matchSplitCap(params.limit, maxLimitFromTier(tier));
    } else if (autoSplit) {
      tileCap = hoursParseSplitCap(params.limit, Boolean(params.openNow));
    }

    const fetchTile = (tile: string): Promise<Record<string, unknown>> =>
      this._postJson(
        '/v1/places/search',
        placesSearchBody({ ...params, bbox: tile }),
        fetchFn,
        sleepFn,
        nowFn,
      );

    const matchCount = async (tile: string): Promise<number> => {
      const stat: OSMFeaturesCountParams = { bbox: tile, wayShape: 'polygon' };
      if (countTags.length > 0) stat.tags = countTags;
      if (params.orTags != null) stat.orTags = params.orTags;
      const body = await this.count(stat, { fetchFn, sleepFn, nowFn });
      if (typeof body.total !== 'number' || !Number.isFinite(body.total)) {
        throw new Error('count response must include total');
      }
      return Math.trunc(body.total);
    };

    const payloads: Record<string, unknown>[] = [];
    for await (const page of iterSplitTiles({
      bbox,
      bboxTiles,
      autoSplit,
      timeout,
      nowFn,
      tileCap,
      matchCount: autoSplit ? matchCount : null,
      fetchTile,
      overflowName: 'places_search',
    })) {
      payloads.push(page);
    }
    return mergePlaceCollections(payloads);
  }

  /** Nearest places from a point (``POST /v1/places/nearby``). Nodes plus polygon POIs; no ``type`` filter. Features have ``properties.openNow`` when hours are known. ``units`` is credits charged. */
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

  /** One place by OSM id (``GET /v1/places/{osm_type}/{osm_id}``). Feature has ``properties.openNow`` when hours are known. ``units`` is credits charged. */
  async places_details(
    params: PlacesDetailsParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<Record<string, unknown>> {
    const { osmType, osmId } = parsePlaceRef(params.osmType, params.osmId);
    const { body } = await this._getJson(
      `/v1/places/${osmType}/${osmId}`,
      {},
      dependencies.fetchFn ?? fetch,
      dependencies.sleepFn ?? sleep,
      dependencies.nowFn ?? Date.now,
    );
    return body;
  }

  /** Reach polygon along the walk/bike network (``POST /v1/routes/isochrone``). ``units`` is credits charged. */
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

  /** Given-order walk/bike path (``POST /v1/routes/path``). ``units`` is credits charged. */
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

  /** TSP walk/bike tour from ``start`` (``POST /v1/routes/optimized_path``). ``loop`` returns to start. ``units`` is credits charged. */
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
