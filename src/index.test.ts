import assert from 'node:assert/strict';
import {
  OSMFeatures,
  resolveBboxTiles,
  splitBbox,
  type OSMFeaturesLayer,
  type OSMGeoJSONPayload,
} from './index.js';

type AppError = Error & {
  status?: number;
  code?: string;
  subtype?: string;
  upstreamStatus?: number;
  upstreamDetail?: string;
};

const osmFeatures = new OSMFeatures('demo-key', {
  apiBaseUrl: 'https://demo.example.com',
  timeoutMs: 1_000,
});

const buildingsLayer: OSMFeaturesLayer = {
  bbox: '18.02,59.305,18.115,59.355',
  tags: ['building'],
  type: 'way,relation',
  shape: 'polygon',
};

const foodLayer: OSMFeaturesLayer = {
  bbox: '18.02,59.305,18.115,59.355',
  orTags: ['amenity=restaurant', 'amenity=cafe'],
};

function feature(id: string): unknown {
  return {
    type: 'Feature',
    id,
    properties: {
      osm_type: 'way',
      osm_id: id,
    },
    geometry: null,
  };
}

function jsonResponse(payload: OSMGeoJSONPayload, init: { status?: number; headers?: HeadersInit } = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function paginationHeaders(
  featureCount: number,
  hasMore: boolean,
  nextCursor: string | null,
  unitsCharged?: number,
): HeadersInit {
  const headers: Record<string, string> = {
    'X-Returned': String(featureCount),
    'X-Has-More': hasMore ? 'true' : 'false',
  };
  if (nextCursor != null) {
    headers['X-Next-Cursor'] = nextCursor;
  }
  if (unitsCharged != null) {
    headers['X-Usage-Units-Charged'] = String(unitsCharged);
  }
  return headers;
}

function geojsonPage(
  features: unknown[],
  hasMore = false,
  nextCursor: string | null = null,
  unitsCharged?: number,
): Response {
  return jsonResponse(
    { type: 'FeatureCollection', features },
    { headers: paginationHeaders(features.length, hasMore, nextCursor, unitsCharged) },
  );
}

function toUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') {
    return new URL(input);
  }
  if (input instanceof URL) {
    return input;
  }
  return new URL(input.url);
}

async function main(): Promise<void> {
  assert.equal(osmFeatures.resolveRequest({ zoom: 'nope' }, buildingsLayer).zoom, undefined);
  assert.equal(osmFeatures.resolveRequest({ limit: '0' }, buildingsLayer).limit, 0);
  assert.equal(osmFeatures.resolveRequest({ cursor: 123 }, buildingsLayer).cursor, '123');
  assert.equal(
    osmFeatures.resolveRequest({}, { ...buildingsLayer, bbox: '18.1,59.4,18.0,59.3' }).bbox,
    '18.1,59.4,18.0,59.3',
  );
  assert.equal(osmFeatures.resolveRequest({}, buildingsLayer).limit, 1000);

  assert.equal(resolveBboxTiles({}), 2);
  assert.equal(resolveBboxTiles({ bbox_tiles: '4' }), 4);
  assert.equal(resolveBboxTiles({ bbox_tiles: '1' }), 1);

  await assert.rejects(
    async () => resolveBboxTiles({ bbox_tiles: '3' }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.status, 400);
      assert.equal(appError.code, 'invalid_bbox_tiles');
      return true;
    },
  );

  const maxLimitRequest = osmFeatures.resolveRequest({
    limit: '6000',
    cursor: 'Mjo=',
  }, buildingsLayer);
  assert.equal(maxLimitRequest.limit, 6000);
  assert.equal(maxLimitRequest.cursor, 'Mjo=');

  await assert.rejects(
    async () => osmFeatures.resolveRequest({ limit: '6250' }, buildingsLayer),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.status, 400);
      assert.equal(appError.code, 'invalid_limit');
      return true;
    },
  );

  const pagedRequest = osmFeatures.resolveRequest({
    limit: '2',
    zoom: '8.5',
  }, foodLayer);
  assert.equal(pagedRequest.zoom, 8.5);

  const taggedLayer: OSMFeaturesLayer = {
    bbox: buildingsLayer.bbox,
    tags: ['highway'],
    notTags: ['highway=footway', 'highway=path'],
    type: 'way,relation',
    shape: 'line',
  };
  const taggedRequest = osmFeatures.resolveRequest({ limit: '1' }, taggedLayer);
  const taggedUrls: URL[] = [];
  await osmFeatures.query(taggedRequest, {
    fetchFn: async (input) => {
      taggedUrls.push(toUrl(input));
      return geojsonPage([]);
    },
  });
  assert.equal(taggedUrls.length, 1);
  assert.deepEqual(taggedUrls[0]?.searchParams.getAll('tags') ?? [], ['highway']);
  assert.deepEqual(
    taggedUrls[0]?.searchParams.getAll('not_tags') ?? [],
    ['highway=footway', 'highway=path'],
  );

  const minAreaRequest = osmFeatures.resolveRequest({
    zoom: '11',
    limit: '1',
    min_area_m2: '250',
    max_area_m2: '9000',
    min_length_m: '12.5',
    max_length_m: '500',
    around: '18.06,59.33,250',
    osm_ids: '111, 222',
    disable_budget_warning: 'true',
    centroid: 'true',
  }, buildingsLayer);
  assert.equal(minAreaRequest.minAreaM2, 250);
  assert.equal(minAreaRequest.centroid, true);
  const minAreaUrls: URL[] = [];
  await osmFeatures.query(minAreaRequest, {
    fetchFn: async (input) => {
      minAreaUrls.push(toUrl(input));
      return geojsonPage([]);
    },
  });
  assert.equal(minAreaUrls[0]?.searchParams.get('min_area_m2'), '250');
  assert.equal(minAreaUrls[0]?.searchParams.get('max_area_m2'), '9000');
  assert.equal(minAreaUrls[0]?.searchParams.get('min_length_m'), '12.5');
  assert.equal(minAreaUrls[0]?.searchParams.get('max_length_m'), '500');
  assert.equal(minAreaUrls[0]?.searchParams.get('around'), '18.06,59.33,250');
  assert.equal(minAreaUrls[0]?.searchParams.get('osm_ids'), '111, 222');
  assert.equal(minAreaUrls[0]?.searchParams.get('disable_budget_warning'), 'true');
  assert.equal(minAreaUrls[0]?.searchParams.get('centroid'), 'true');

  const noMinAreaRequest = osmFeatures.resolveRequest({ zoom: '11', limit: '1' }, buildingsLayer);
  const noMinAreaUrls: URL[] = [];
  await osmFeatures.query(noMinAreaRequest, {
    fetchFn: async (input) => {
      noMinAreaUrls.push(toUrl(input));
      return geojsonPage([]);
    },
  });
  assert.equal(noMinAreaUrls[0]?.searchParams.get('min_area_m2'), null);

  const paginationUrls: URL[] = [];
  const paginationResponses = [
    geojsonPage([feature('page-1')], true, 'Mjo='),
    geojsonPage([feature('page-2')], false, 'NDo='),
  ];

  const pagedPayload = await osmFeatures.query_all({
    ...foodLayer,
    limitPerPage: 2,
    zoom: 8.5,
    bboxTiles: 1,
  }, {
    fetchFn: async (input) => {
      paginationUrls.push(toUrl(input));
      const response = paginationResponses.shift();
      if (!response) {
        throw new Error('expected paginated upstream response');
      }
      return response;
    },
  });

  assert.deepEqual(
    paginationUrls.map((url) => url.searchParams.get('cursor')),
    [null, 'Mjo='],
  );
  assert.deepEqual(pagedPayload.data.features, [feature('page-1'), feature('page-2')]);
  assert.equal(pagedPayload.meta.page_count, 2);
  assert.equal(
    'meta' in pagedPayload.data,
    false,
    'GeoJSON data object must not include meta',
  );

  const billed = await osmFeatures.query({ ...buildingsLayer, limit: 1 }, {
    fetchFn: async () => geojsonPage([feature('billed')], false, null, 42),
  });
  assert.ok(!(billed.data instanceof ArrayBuffer));
  assert.equal(billed.meta.units_charged, 42);

  const retrySleeps: number[] = [];
  const retryResponses = [
    geojsonPage([feature('root-page')], true, 'MjUwMDpX'),
    new Response(null, { status: 429 }),
    new Response(null, { status: 429 }),
    new Response(null, { status: 429 }),
    new Response(null, { status: 429 }),
  ];

  const retriedPayload = await osmFeatures.query_all({
    ...foodLayer,
    limitPerPage: pagedRequest.limit,
    zoom: pagedRequest.zoom,
    bboxTiles: 1,
  }, {
    fetchFn: async () => {
      const response = retryResponses.shift();
      if (!response) {
        throw new Error('expected retry-path upstream response');
      }
      return response;
    },
    sleepFn: async (ms) => {
      retrySleeps.push(ms);
    },
  });

  assert.deepEqual(retrySleeps, [750, 1500, 3000]);
  assert.equal(retriedPayload.meta.relay_partial, true);
  assert.equal(retriedPayload.meta.relay_partial_reason, 'upstream_rate_limited_after_retries');

  const partialRequest = osmFeatures.resolveRequest({ limit: '2' }, buildingsLayer);
  const partialResponses = [
    geojsonPage([feature('parent-page')], true, 'NjAwMDpX'),
    new Response(null, { status: 400 }),
  ];

  const partialPayload = await osmFeatures.query_all({
    ...buildingsLayer,
    limitPerPage: partialRequest.limit,
    bboxTiles: 1,
  }, {
    fetchFn: async () => {
      const response = partialResponses.shift();
      if (!response) {
        throw new Error('expected partial-path upstream response');
      }
      return response;
    },
  });
  assert.equal(partialPayload.meta.relay_partial_reason, 'upstream_rejected_cursor');

  await assert.rejects(
    async () => osmFeatures.query_all({
      ...foodLayer,
      limitPerPage: pagedRequest.limit,
      zoom: pagedRequest.zoom,
      bboxTiles: 1,
    }, {
      fetchFn: async () => new Response('bbox is invalid for this preset', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
      }),
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.code, 'upstream_status');
      assert.equal(appError.upstreamDetail, 'bbox is invalid for this preset');
      return true;
    },
  );

  assert.deepEqual(splitBbox('0,0,2,1', 2), ['0,0,1,1', '1,0,2,1']);

  const singleQueryUrls: URL[] = [];
  await osmFeatures.query({ ...buildingsLayer, limit: 1 }, {
    fetchFn: async (input) => {
      singleQueryUrls.push(toUrl(input));
      return geojsonPage([feature('only')], true, 'cursor');
    },
  });
  assert.equal(singleQueryUrls.length, 1);
  assert.equal(singleQueryUrls[0]?.searchParams.get('limit'), '1');

  const expectedTiles = splitBbox(buildingsLayer.bbox, 2);
  const tiledUrls: URL[] = [];
  const tiledPayload = await osmFeatures.query_all({ ...buildingsLayer, limitPerPage: 10 }, {
    fetchFn: async (input) => {
      const url = toUrl(input);
      tiledUrls.push(url);
      const bbox = url.searchParams.get('bbox');
      if (bbox === expectedTiles[0]) {
        return geojsonPage([feature('shared'), feature('tile-a')]);
      }
      return geojsonPage([feature('shared'), feature('tile-b')]);
    },
  });
  assert.equal(tiledUrls.length, 2);
  assert.deepEqual(tiledPayload.data.features, [
    feature('shared'),
    feature('tile-a'),
    feature('tile-b'),
  ]);
  assert.equal(tiledPayload.meta.has_more, false);

  // Cap stop on tile1 must mark incomplete even when that tile's last page says done.
  const capTiles = splitBbox(buildingsLayer.bbox, 2);
  const capUrls: URL[] = [];
  const capped = await osmFeatures.query_all({
    ...buildingsLayer,
    limitPerPage: 10,
    bboxTiles: 2,
    maxFeatures: 2,
  }, {
    fetchFn: async (input) => {
      const url = toUrl(input);
      capUrls.push(url);
      const bbox = url.searchParams.get('bbox');
      if (bbox === capTiles[0]) {
        return geojsonPage([feature('cap-a'), feature('cap-b')]);
      }
      return geojsonPage([feature('cap-c')]);
    },
  });
  assert.equal(capUrls.length, 1);
  assert.deepEqual(capped.data.features, [feature('cap-a'), feature('cap-b')]);
  assert.equal(capped.meta.has_more, true);

  // maxPages mid-tile: later tiles may finish, but result stays incomplete.
  const pagedOut = await osmFeatures.query_all({
    ...foodLayer,
    limitPerPage: 1,
    bboxTiles: 1,
    maxPages: 1,
  }, {
    fetchFn: async () => geojsonPage([feature('page-cap')], true, 'still-more'),
  });
  assert.equal(pagedOut.data.features.length, 1);
  assert.equal(pagedOut.meta.has_more, true);
  assert.equal(pagedOut.meta.next_cursor, 'still-more');

  // Cap uses unique count: raw overshoot with dups under cap, all tiles done → complete.
  const dupCap = await osmFeatures.query_all({
    ...foodLayer,
    limitPerPage: 10,
    bboxTiles: 1,
    maxFeatures: 2,
  }, {
    fetchFn: async () => geojsonPage([
      feature('dup'),
      feature('dup'),
      feature('dup'),
    ]),
  });
  assert.deepEqual(dupCap.data.features, [feature('dup')]);
  assert.equal(dupCap.meta.has_more, false);

  // Binary Accept: query returns { data: ArrayBuffer, meta } and forwards Accept.
  let binaryAcceptHeader: string | null = null;
  const fgbBytes = new Uint8Array([0x66, 0x67, 0x62, 0x01]).buffer;
  const binary = await osmFeatures.query(
    { ...buildingsLayer, accept: 'application/flatgeobuf' },
    {
      fetchFn: async (_input, init) => {
        binaryAcceptHeader = new Headers(init?.headers).get('Accept');
        return new Response(fgbBytes.slice(0), {
          status: 200,
          headers: {
            'content-type': 'application/flatgeobuf',
            ...paginationHeaders(2, true, 'Y3Vyc29y'),
            'X-Usage-Units-Charged': '7',
          },
        });
      },
    },
  );
  assert.equal(binaryAcceptHeader, 'application/flatgeobuf');
  assert.ok(binary.data instanceof ArrayBuffer);
  assert.deepEqual(new Uint8Array(binary.data), new Uint8Array([0x66, 0x67, 0x62, 0x01]));
  assert.equal(binary.meta.returned, 2);
  assert.equal(binary.meta.has_more, true);
  assert.equal(binary.meta.next_cursor, 'Y3Vyc29y');
  assert.equal(binary.meta.units_charged, 7);

  // query_all refuses non-GeoJSON Accept up front.
  await assert.rejects(
    async () => osmFeatures.query_all({
      ...buildingsLayer,
      bboxTiles: 1,
      accept: 'application/flatgeobuf',
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.status, 400);
      assert.equal(appError.code, 'invalid_accept');
      return true;
    },
  );

  console.log('osmfeatures checks passed');
}

void main();
