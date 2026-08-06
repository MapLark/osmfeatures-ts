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
export type OSMFeaturesPayload = {
  type: 'FeatureCollection';
  features: unknown[];
};

/** SDK page: GeoJSON body + header-derived meta (separate objects). */
export type OSMFeaturesResult = {
  data: OSMFeaturesPayload;
  meta: OSMFeaturesMeta;
};

function resultFromFeatures(
  features: unknown[],
  meta: OSMFeaturesMeta,
): OSMFeaturesResult {
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
  bbox: string;
  tags?: string[];
  orTags?: string[];
  notTags?: string[];
  type?: string;
  shape?: 'line' | 'polygon' | 'all';
};

/** Flat query params (same idea as Python `query(**params)`). */
export type OSMFeaturesParams = OSMFeaturesLayer & {
  limit?: number;
  cursor?: string;
  zoom?: number;
  around?: string;
  osmIds?: string;
  minLengthM?: number;
  maxLengthM?: number;
  minAreaM2?: number;
  maxAreaM2?: number;
  disableBudgetWarning?: boolean;
  centroid?: boolean;
  /** Accept media type. Default application/geo+json; other types return ArrayBuffer. */
  accept?: string;
};

type QueryValue = unknown;
export type OSMFeaturesQuery = Record<string, QueryValue>;

type OSMFeaturesDependencies = {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
};

const DEFAULT_BASE_URL = 'https://api.maplark.com';
const DEFAULT_LIMIT = 1000;
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

function parseLimit(query: OSMFeaturesQuery, fallback: number = DEFAULT_LIMIT): number {
  const raw = optionalString(query, 'limit');
  if (raw == null) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
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
  bbox: string;
  limit: number;
  cursor?: string;
  zoom?: number;
  around?: string;
  osmIds?: string;
  minLengthM?: number;
  maxLengthM?: number;
  minAreaM2?: number;
  maxAreaM2?: number;
  disableBudgetWarning?: boolean;
  centroid?: boolean;
  accept?: string;
  type?: string;
  shape?: string;
  tags?: string[];
  orTags?: string[];
  notTags?: string[];
};

function buildFeaturesQuery(params: RawQueryParams): URLSearchParams {
  const query = new URLSearchParams();
  query.set('bbox', params.bbox);
  query.set('limit', String(params.limit));
  if (params.cursor) {
    query.set('cursor', params.cursor);
  }
  if (params.zoom != null) {
    query.set('zoom', String(params.zoom));
  }
  if (params.around) {
    query.set('around', params.around);
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
  if (params.disableBudgetWarning != null) {
    query.set('disable_budget_warning', String(params.disableBudgetWarning));
  }
  if (params.centroid != null) {
    query.set('centroid', String(params.centroid));
  }
  if (params.type) {
    query.set('type', params.type);
  }
  if (params.shape) {
    query.set('shape', params.shape);
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
      around: optionalString(query, 'around'),
      osmIds: optionalString(query, 'osm_ids'),
      minLengthM: optionalNumber(query, 'min_length_m'),
      maxLengthM: optionalNumber(query, 'max_length_m'),
      minAreaM2: optionalNumber(query, 'min_area_m2'),
      maxAreaM2: optionalNumber(query, 'max_area_m2'),
      disableBudgetWarning: optionalBoolean(query, 'disable_budget_warning'),
      centroid: optionalBoolean(query, 'centroid'),
    };
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

  /** Single HTTP request with retry. Throws on non-OK (same role as Python `_raw_query`). */
  private async _rawQuery(
    params: RawQueryParams,
    fetchFn: typeof fetch,
    sleepFn: (ms: number) => Promise<void>,
    nowFn: () => number,
  ): Promise<OSMFeaturesResult | ArrayBuffer> {
    const query = buildFeaturesQuery(params);
    const upstreamUrl = new URL(`${this.apiBaseUrl}/v2/osm_features`);
    for (const [key, value] of query.entries()) {
      upstreamUrl.searchParams.append(key, value);
    }

    let upstream: globalThis.Response;
    let retryAttempt = 0;

    while (true) {
      try {
        upstream = await fetchFn(upstreamUrl.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: params.accept || GEOJSON_ACCEPT,
            'User-Agent': 'osmfeatures',
          },
          signal: AbortSignal.timeout(this.timeoutMs),
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
        break;
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
        await sleepFn(waitMs);
        continue;
      }

      await this.throwUpstreamError(upstream);
    }

    if (isGeojsonAccept(params.accept)) {
      const body = (await upstream.json()) as OSMFeaturesPayload;
      const features = Array.isArray(body.features) ? body.features : [];
      return resultFromFeatures(
        features,
        metaFromHeaders(upstream.headers, features.length),
      );
    }
    return upstream.arrayBuffer();
  }

  /** Single upstream page. Params map 1:1 to server query string (no tiling). */
  async query(
    {
      bbox,
      tags,
      orTags,
      notTags,
      type,
      shape,
      limit = DEFAULT_LIMIT,
      cursor,
      zoom,
      around,
      osmIds,
      minLengthM,
      maxLengthM,
      minAreaM2,
      maxAreaM2,
      disableBudgetWarning,
      centroid,
      accept,
    }: OSMFeaturesParams,
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<OSMFeaturesResult | ArrayBuffer> {
    const payload = await this._rawQuery(
      {
        bbox,
        tags,
        orTags,
        notTags,
        type,
        shape,
        limit,
        cursor,
        zoom,
        around,
        osmIds,
        minLengthM,
        maxLengthM,
        minAreaM2,
        maxAreaM2,
        disableBudgetWarning,
        centroid,
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
      shape,
      zoom,
      around,
      osmIds,
      minLengthM,
      maxLengthM,
      minAreaM2,
      maxAreaM2,
      disableBudgetWarning,
      centroid,
      limitPerPage = DEFAULT_LIMIT,
      bboxTiles = 2,
      maxPages = 15,
      maxFeatures = 55_000,
    }: Omit<OSMFeaturesParams, 'limit' | 'cursor'> & {
      /** Upstream `limit` per HTTP request (page size). */
      limitPerPage?: number;
      bboxTiles?: number;
      maxPages?: number;
      /** Cap on merged features. `null` = no cap. */
      maxFeatures?: number | null;
    },
    dependencies: OSMFeaturesDependencies = {},
  ): Promise<OSMFeaturesResult> {
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

    const tileBboxes = splitBbox(bbox, bboxTiles);
    const allFeatures: unknown[] = [];
    let pageCount = 0;
    let lastPage: OSMFeaturesResult | null = null;
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
      shape,
      limit: limitPerPage,
      zoom,
      around,
      osmIds,
      minLengthM,
      maxLengthM,
      minAreaM2,
      maxAreaM2,
      disableBudgetWarning,
      centroid,
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
        let page: OSMFeaturesResult;
        try {
          const raw = await this._rawQuery(
            { ...baseParams, bbox: tileBbox, cursor },
            fetchFn,
            sleepFn,
            nowFn,
          );
          if (raw instanceof ArrayBuffer) {
            throw appError(
              400,
              'invalid_accept',
              'query_all only supports GeoJSON; use query({ accept }) for binary encodings.',
            );
          }
          page = raw;
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

        const pageFeatures = Array.isArray(page.data.features) ? page.data.features : [];
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
}

export * from './geojson-feature.js';
export * from './preset/index.js';
