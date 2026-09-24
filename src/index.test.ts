import assert from 'node:assert/strict';
import {
  OSMFeatures,
  isOpenNow,
  readOpenNow,
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
  wayShape: 'polygon',
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

function resultHeaders(featureCount: number, unitsCharged?: number): HeadersInit {
  const headers: Record<string, string> = {
    'X-Returned': String(featureCount),
  };
  if (unitsCharged != null) {
    headers['X-Usage-Units-Charged'] = String(unitsCharged);
  }
  return headers;
}

function geojsonPage(features: unknown[], unitsCharged?: number): Response {
  return jsonResponse(
    { type: 'FeatureCollection', features },
    { headers: resultHeaders(features.length, unitsCharged) },
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

function tooLargeResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'bad_request',
      detail: 'result exceeds the 100000 feature limit',
      status_code: 400,
      subtype: 'result_too_large',
    }),
    { status: 400, headers: { 'content-type': 'application/json' } },
  );
}

function statsTotal(total: number): Response {
  return new Response(
    JSON.stringify({
      groups: [{ value: 'yes', count: total }],
      total,
      truncated: false,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function pathOf(url: URL): string {
  return url.pathname;
}

async function main(): Promise<void> {
  assert.equal(osmFeatures.resolveRequest({ zoom: 'nope' }, buildingsLayer).zoom, undefined);
  assert.equal(
    osmFeatures.resolveRequest({}, { ...buildingsLayer, bbox: '18.1,59.4,18.0,59.3' }).bbox,
    '18.1,59.4,18.0,59.3',
  );

  assert.equal(resolveBboxTiles({}), 1);
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

  const zoomedRequest = osmFeatures.resolveRequest({ zoom: '8.5' }, foodLayer);
  assert.equal(zoomedRequest.zoom, 8.5);

  const taggedLayer: OSMFeaturesLayer = {
    bbox: buildingsLayer.bbox,
    tags: ['highway'],
    notTags: ['highway=footway', 'highway=path'],
    type: 'way,relation',
    wayShape: 'line',
  };
  const taggedRequest = osmFeatures.resolveRequest({}, taggedLayer);
  const taggedUrls: URL[] = [];
  await osmFeatures.query(taggedRequest, {
    fetchFn: async (input) => {
      taggedUrls.push(toUrl(input));
      return geojsonPage([]);
    },
  });
  assert.equal(taggedUrls.length, 1);
  assert.equal(taggedUrls[0]?.pathname, '/v3/osm_features');
  assert.deepEqual(taggedUrls[0]?.searchParams.getAll('tags') ?? [], ['highway']);
  assert.deepEqual(
    taggedUrls[0]?.searchParams.getAll('not_tags') ?? [],
    ['highway=footway', 'highway=path'],
  );

  const minAreaRequest = osmFeatures.resolveRequest({
    zoom: '11',
    min_area_m2: '250',
    max_area_m2: '9000',
    min_length_m: '12.5',
    max_length_m: '500',
    location: '59.33,18.06',
    radius: '250',
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
  assert.equal(minAreaUrls[0]?.searchParams.get('location'), '59.33,18.06');
  assert.equal(minAreaUrls[0]?.searchParams.get('radius'), '250');
  assert.equal(minAreaUrls[0]?.searchParams.get('around'), null);
  assert.equal(minAreaUrls[0]?.searchParams.get('osm_ids'), '111, 222');
  assert.equal(minAreaUrls[0]?.searchParams.get('disable_budget_warning'), null);
  assert.equal(minAreaUrls[0]?.searchParams.get('centroid'), 'true');

  const radiusUrls: URL[] = [];
  await osmFeatures.query(
    { location: '59.334,18.063', radius: 500, tags: ['amenity=cafe'] },
    {
      fetchFn: async (input) => {
        radiusUrls.push(toUrl(input));
        return geojsonPage([]);
      },
    },
  );
  assert.equal(radiusUrls[0]?.searchParams.get('location'), '59.334,18.063');
  assert.equal(radiusUrls[0]?.searchParams.get('radius'), '500');
  assert.equal(radiusUrls[0]?.searchParams.get('around'), null);
  assert.equal(radiusUrls[0]?.searchParams.get('bbox'), null);

  const withinUrls: URL[] = [];
  await osmFeatures.query(
    { within: 'relation/398021', type: 'node', tags: ['amenity'] },
    {
      fetchFn: async (input) => {
        withinUrls.push(toUrl(input));
        return geojsonPage([]);
      },
    },
  );
  assert.equal(withinUrls[0]?.searchParams.get('within'), 'relation/398021');
  assert.equal(withinUrls[0]?.searchParams.get('bbox'), null);

  const withinAllUrls: URL[] = [];
  await osmFeatures.query_all(
    { within: 'relation/398021', tags: ['amenity'] },
    {
      fetchFn: async (input) => {
        withinAllUrls.push(toUrl(input));
        return geojsonPage([]);
      },
    },
  );
  assert.equal(withinAllUrls.length, 1);
  assert.equal(withinAllUrls[0]?.pathname, '/v3/osm_features');
  assert.equal(withinAllUrls[0]?.searchParams.get('within'), 'relation/398021');
  assert.equal(withinAllUrls[0]?.searchParams.get('bbox'), null);
  assert.equal(withinAllUrls[0]?.searchParams.get('limit'), null);

  const limitedUrls: URL[] = [];
  const limited = await osmFeatures.query(
    { bbox: buildingsLayer.bbox, tags: ['building'], limit: 10 },
    {
      fetchFn: async (input) => {
        limitedUrls.push(toUrl(input));
        return jsonResponse(
          { type: 'FeatureCollection', features: [feature('way/1')] },
          { headers: { ...resultHeaders(1), 'X-Has-More': 'true' } },
        );
      },
    },
  );
  assert.equal(limitedUrls[0]?.searchParams.get('limit'), '10');
  assert.ok(!(limited.data instanceof ArrayBuffer));
  assert.equal(limited.meta.has_more, true);
  assert.equal(limited.data.features.length, 1);

  const paidUrls: URL[] = [];
  await osmFeatures.query(
    { bbox: buildingsLayer.bbox, tags: ['building'], limit: 200_000 },
    {
      fetchFn: async (input) => {
        paidUrls.push(toUrl(input));
        return geojsonPage([]);
      },
    },
  );
  assert.equal(paidUrls[0]?.searchParams.get('limit'), '200000');

  await assert.rejects(
    async () => osmFeatures.query({ bbox: buildingsLayer.bbox, limit: 1_000_001 }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.code, 'invalid_limit');
      return true;
    },
  );

  await assert.rejects(
    async () => osmFeatures.query({
      within: 'relation/398021',
      tags: ['amenity'],
      bboxTiles: 2,
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.code, 'invalid_bbox_tiles');
      assert.match(appError.message, /bbox/);
      return true;
    },
  );

  const statsResolved = osmFeatures.resolveCountRequest(
    new URLSearchParams('within=relation/398021&tags=amenity&tags=building&group_by=amenity&limit=20'),
  );
  assert.equal(statsResolved.groupBy, 'amenity');
  assert.equal(statsResolved.within, 'relation/398021');
  assert.deepEqual(statsResolved.tags, ['amenity', 'building']);
  assert.equal(statsResolved.limit, 20);

  await assert.rejects(
    async () => osmFeatures.resolveCountRequest({ bbox: '18.06,59.32,18.09,59.34' }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.status, 400);
      assert.equal(appError.code, 'invalid_group_by');
      return true;
    },
  );

  const statsUrls: URL[] = [];
  const statsOut = await osmFeatures.count(
    { groupBy: 'amenity', bbox: '18.06,59.32,18.09,59.34', tags: ['amenity'], type: 'node' },
    {
      fetchFn: async (input) => {
        statsUrls.push(toUrl(input));
        return new Response(
          JSON.stringify({
            groups: [{ value: 'cafe', count: 12 }],
            total: 12,
            truncated: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(statsOut.total, 12);
  assert.equal(statsOut.groups[0]?.value, 'cafe');
  assert.equal(statsUrls[0]?.pathname, '/v2/osm_features/count');
  assert.equal(statsUrls[0]?.searchParams.get('group_by'), 'amenity');
  assert.deepEqual(statsUrls[0]?.searchParams.getAll('tags'), ['amenity']);
  assert.equal(statsUrls[0]?.searchParams.get('bbox'), '18.06,59.32,18.09,59.34');
  assert.equal(statsUrls[0]?.searchParams.get('type'), 'node');

  const statsWithinUrls: URL[] = [];
  await osmFeatures.count(
    { groupBy: 'amenity', within: 'relation/398021', tags: ['amenity'] },
    {
      fetchFn: async (input) => {
        statsWithinUrls.push(toUrl(input));
        return new Response(
          JSON.stringify({ groups: [], total: 0, truncated: false }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(statsWithinUrls[0]?.searchParams.get('within'), 'relation/398021');
  assert.equal(statsWithinUrls[0]?.searchParams.get('bbox'), null);

  const noMinAreaRequest = osmFeatures.resolveRequest({ zoom: '11' }, buildingsLayer);
  const noMinAreaUrls: URL[] = [];
  await osmFeatures.query(noMinAreaRequest, {
    fetchFn: async (input) => {
      noMinAreaUrls.push(toUrl(input));
      return geojsonPage([]);
    },
  });
  assert.equal(noMinAreaUrls[0]?.searchParams.get('min_area_m2'), null);

  const fitUrls: URL[] = [];
  const fit = await osmFeatures.query_all({
    bbox: '0,0,1,1',
    tags: ['building'],
  }, {
    fetchFn: async (input) => {
      fitUrls.push(toUrl(input));
      return geojsonPage([feature('way/1')]);
    },
  });
  assert.ok(!(fit.data instanceof ArrayBuffer));
  assert.deepEqual(fit.data.features, [feature('way/1')]);
  assert.equal(fitUrls.length, 1);
  assert.equal(fitUrls[0]?.pathname, '/v3/osm_features');
  assert.equal(fitUrls[0]?.searchParams.get('limit'), null);
  assert.equal(fitUrls[0]?.searchParams.get('cursor'), null);
  assert.equal(
    fitUrls.some((url) => pathOf(url) === '/v2/osm_features/count'),
    false,
  );
  assert.equal('meta' in fit.data, false, 'GeoJSON data object must not include meta');

  const billed = await osmFeatures.query(
    { location: '59.33,18.06', radius: 250, tags: ['building'] },
    {
      fetchFn: async () => geojsonPage([feature('billed')], 42),
    },
  );
  assert.ok(!(billed.data instanceof ArrayBuffer));
  assert.equal(billed.meta.units_charged, 42);

  const retrySleeps: number[] = [];
  const retryResponses = [
    new Response(null, { status: 429 }),
    new Response(null, { status: 429 }),
    new Response(null, { status: 429 }),
    geojsonPage([feature('retried')]),
  ];
  const retried = await osmFeatures.query(foodLayer, {
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
  assert.ok(!(retried.data instanceof ArrayBuffer));
  assert.deepEqual(retried.data.features, [feature('retried')]);

  await assert.rejects(
    async () => osmFeatures.query({
      ...foodLayer,
      zoom: zoomedRequest.zoom,
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

  const expectedTiles = splitBbox('0,0,2,1', 2);
  const tiledUrls: URL[] = [];
  const tiledPayload = await osmFeatures.query({
    bbox: '0,0,2,1',
    tags: ['building'],
    bboxTiles: 2,
  }, {
    fetchFn: async (input) => {
      const url = toUrl(input);
      tiledUrls.push(url);
      const tile = url.searchParams.get('bbox');
      if (tile === expectedTiles[0]) {
        return geojsonPage([feature('way/1')]);
      }
      return geojsonPage([feature('way/2')]);
    },
  });
  assert.ok(!(tiledPayload.data instanceof ArrayBuffer));
  assert.deepEqual(tiledUrls.map((url) => url.searchParams.get('bbox')), expectedTiles);
  assert.deepEqual(tiledPayload.data.features, [feature('way/1'), feature('way/2')]);
  assert.equal(tiledPayload.meta.has_more, false);

  const capTiles = splitBbox(buildingsLayer.bbox!, 2);
  const capUrls: URL[] = [];
  const capped = await osmFeatures.query({
    ...buildingsLayer,
    bboxTiles: 2,
    maxFeatures: 2,
  }, {
    fetchFn: async (input) => {
      const url = toUrl(input);
      capUrls.push(url);
      const tile = url.searchParams.get('bbox');
      if (tile === capTiles[0]) {
        return geojsonPage([feature('cap-a'), feature('cap-b')]);
      }
      return geojsonPage([feature('cap-c')]);
    },
  });
  assert.ok(!(capped.data instanceof ArrayBuffer));
  assert.equal(capUrls.length, 1);
  assert.deepEqual(capped.data.features, [feature('cap-a'), feature('cap-b')]);
  assert.equal(capped.meta.has_more, true);

  const dupCap = await osmFeatures.query({
    ...foodLayer,
    bboxTiles: 1,
    maxFeatures: 2,
  }, {
    fetchFn: async () => geojsonPage([
      feature('dup'),
      feature('dup'),
      feature('dup'),
    ]),
  });
  assert.ok(!(dupCap.data instanceof ArrayBuffer));
  assert.deepEqual(dupCap.data.features, [feature('dup')]);
  assert.equal(dupCap.meta.has_more, true);

  const overflowBbox = '0,0,2,2';
  const overflowTiles = splitBbox(overflowBbox, 4);
  const overflowQuarters = splitBbox(overflowTiles[2]!, 4);
  const overflowGrandchildren = splitBbox(overflowQuarters[0]!, 4);
  const overflowFeatureQueue = [
    geojsonPage([feature('way/0')]),
    geojsonPage([feature('way/1')]),
    geojsonPage([feature('way/3')]),
    geojsonPage([feature('way/21')]),
    geojsonPage([feature('way/22')]),
    geojsonPage([feature('way/23')]),
    geojsonPage([feature('way/40')]),
    geojsonPage([feature('way/41')]),
    geojsonPage([feature('way/42')]),
    geojsonPage([feature('way/43')]),
  ];
  const overflowStatsQueue = [
    statsTotal(1),
    statsTotal(1),
    statsTotal(200_000),
    statsTotal(1),
    statsTotal(200_000),
    statsTotal(1),
    statsTotal(1),
    statsTotal(1),
    statsTotal(1),
    statsTotal(1),
    statsTotal(1),
    statsTotal(1),
  ];
  const overflowUrls: URL[] = [];
  const overflow = await osmFeatures.query({
    bbox: overflowBbox,
    bboxTiles: 4,
    tags: ['building'],
    splitUntilFit: true,
  }, {
    fetchFn: async (input) => {
      const url = toUrl(input);
      overflowUrls.push(url);
      if (url.pathname === '/v2/osm_features/count') {
        const response = overflowStatsQueue.shift();
        if (!response) {
          throw new Error('expected stats response');
        }
        return response;
      }
      const response = overflowFeatureQueue.shift();
      if (!response) {
        throw new Error('expected feature response');
      }
      return response;
    },
  });
  assert.ok(!(overflow.data instanceof ArrayBuffer));
  assert.deepEqual(
    new Set((overflow.data.features as { id: string }[]).map((item) => item.id)),
    new Set([
      'way/0', 'way/1', 'way/3', 'way/21', 'way/22', 'way/23',
      'way/40', 'way/41', 'way/42', 'way/43',
    ]),
  );
  const featureBboxes = overflowUrls
    .filter((url) => url.pathname === '/v3/osm_features')
    .map((url) => url.searchParams.get('bbox'));
  assert.deepEqual(featureBboxes, [
    overflowTiles[0], overflowTiles[1], overflowTiles[3],
    overflowQuarters[1], overflowQuarters[2], overflowQuarters[3],
    ...overflowGrandchildren,
  ]);
  assert.equal(featureBboxes.includes(overflowTiles[2]!), false);
  assert.equal(featureBboxes.includes(overflowQuarters[0]!), false);
  assert.deepEqual(
    overflowUrls
      .filter((url) => url.pathname === '/v2/osm_features/count')
      .map((url) => url.searchParams.get('bbox')),
    [
      ...overflowTiles,
      overflowQuarters[0], overflowQuarters[1], overflowQuarters[2], overflowQuarters[3],
      ...overflowGrandchildren,
    ],
  );

  const kept = await osmFeatures.query({
    bbox: '0,0,2,2',
    tags: ['building'],
  }, {
    fetchFn: async () => jsonResponse(
      { type: 'FeatureCollection', features: [feature('way/1')] },
      { headers: { ...resultHeaders(1), 'X-Has-More': 'true' } },
    ),
  });
  assert.ok(!(kept.data instanceof ArrayBuffer));
  assert.equal(kept.meta.has_more, true);
  assert.equal(kept.data.features.length, 1);

  await assert.rejects(
    async () => osmFeatures.query({
      bbox: '0,0,2,2',
      tags: ['building'],
    }, {
      fetchFn: async () => tooLargeResponse(),
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.match(`${appError.upstreamDetail ?? ''} ${appError.message}`, /result_too_large/);
      assert.doesNotMatch(appError.message, /splitUntilFit/);
      return true;
    },
  );

  await assert.rejects(
    async () => osmFeatures.query({
      within: 'relation/155790',
      type: 'node',
      tags: ['amenity'],
    }, {
      fetchFn: async () => tooLargeResponse(),
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.match(`${appError.upstreamDetail ?? ''} ${appError.message}`, /result_too_large/);
      return true;
    },
  );

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
            ...resultHeaders(2, 7),
          },
        });
      },
    },
  );
  assert.equal(binaryAcceptHeader, 'application/flatgeobuf');
  assert.ok(binary.data instanceof ArrayBuffer);
  assert.deepEqual(new Uint8Array(binary.data), new Uint8Array([0x66, 0x67, 0x62, 0x01]));
  assert.equal(binary.meta.returned, 2);
  assert.equal(binary.meta.has_more, false);
  assert.equal(binary.meta.units_charged, 7);

  await assert.rejects(
    async () => osmFeatures.query({
      ...buildingsLayer,
      accept: 'application/flatgeobuf',
      splitUntilFit: true,
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.status, 400);
      assert.equal(appError.code, 'invalid_accept');
      return true;
    },
  );

  let searchUrl = '';
  let searchBody: Record<string, unknown> | undefined;
  const searchOut = await osmFeatures.places_search(
    {
      location: { lat: 59.316, lon: 18.075 },
      radius: 500,
      orTags: ['amenity=cafe'],
      openNow: true,
      asOf: '2026-08-10T18:00:00+02:00',
      limit: 10,
    },
    {
      fetchFn: async (input, init) => {
        searchUrl = toUrl(input).pathname;
        searchBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ type: 'FeatureCollection', features: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(searchOut['type'], 'FeatureCollection');
  assert.equal(searchUrl, '/v1/places/search');
  assert.deepEqual(searchBody?.['location'], { lat: 59.316, lng: 18.075 });
  assert.deepEqual(searchBody?.['orTags'], ['amenity=cafe']);
  assert.equal(searchBody?.['openNow'], true);
  assert.equal(searchBody?.['asOf'], '2026-08-10T18:00:00+02:00');
  assert.equal(searchBody?.['limit'], 10);

  let nearbyUrl = '';
  let nearbyBody: Record<string, unknown> | undefined;
  const nearbyOut = await osmFeatures.places_nearby(
    {
      location: { lat: 59.3, lng: 18.0 },
      limit: 3,
      openNow: true,
      asOf: '2026-08-10T18:00:00+02:00',
    },
    {
      fetchFn: async (input, init) => {
        nearbyUrl = toUrl(input).pathname;
        nearbyBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ status: 'ok', items: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(nearbyOut['status'], 'ok');
  assert.equal(nearbyUrl, '/v1/places/nearby');
  assert.equal(nearbyBody?.['openNow'], true);
  assert.equal(nearbyBody?.['asOf'], '2026-08-10T18:00:00+02:00');
  assert.equal(nearbyBody?.['limit'], 3);
  assert.equal('radius' in (nearbyBody ?? {}), false);

  let detailsUrl = '';
  const detailsOut = await osmFeatures.places_details(
    { osmType: 'node/123' },
    {
      fetchFn: async (input) => {
        detailsUrl = toUrl(input).pathname;
        return new Response(
          JSON.stringify({ status: 'ok', feature: { id: 'node/123' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(detailsOut['status'], 'ok');
  assert.equal(detailsUrl, '/v1/places/node/123');

  await assert.rejects(
    async () => osmFeatures.places_details({ osmType: 'highway', osmId: 1 }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.status, 400);
      assert.equal(appError.code, 'invalid_place_id');
      return true;
    },
  );

  let usageUrl = '';
  const usageOut = await osmFeatures.usage({
    fetchFn: async (input) => {
      usageUrl = toUrl(input).pathname;
      return new Response(
        JSON.stringify({ tier: 'standard', usage_this_month: 1 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });
  assert.equal(usageOut['tier'], 'standard');
  assert.equal(usageUrl, '/v1/usage');

  let isoUrl = '';
  let isoBody: Record<string, unknown> | undefined;
  const isoOut = await osmFeatures.routes_isochrone(
    { origin: { lon: 18.075, lat: 59.316 }, maxDistanceM: 500 },
    {
      fetchFn: async (input, init) => {
        isoUrl = toUrl(input).pathname;
        isoBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ status: 'ok', geometry: { type: 'Polygon', coordinates: [] } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(isoOut['status'], 'ok');
  assert.equal(isoUrl, '/v1/routes/isochrone');
  assert.deepEqual(isoBody?.['origin'], { lon: 18.075, lat: 59.316 });
  assert.equal(isoBody?.['max_distance_m'], 500);
  assert.equal('travelMode' in (isoBody ?? {}), false);

  let pathUrl = '';
  let pathBody: Record<string, unknown> | undefined;
  const pathOut = await osmFeatures.routes_path(
    {
      stops: [{ lon: 18.075, lat: 59.316 }, { lng: 18.08, lat: 59.318 }],
    },
    {
      fetchFn: async (input, init) => {
        pathUrl = toUrl(input).pathname;
        pathBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ status: 'ok', geometry: { type: 'LineString', coordinates: [] } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(pathOut['status'], 'ok');
  assert.equal(pathUrl, '/v1/routes/path');
  assert.deepEqual(pathBody?.['stops'], [{ lon: 18.075, lat: 59.316 }, { lon: 18.08, lat: 59.318 }]);
  assert.equal('travelMode' in (pathBody ?? {}), false);
  assert.equal('loop' in (pathBody ?? {}), false);

  let optUrl = '';
  let optBody: Record<string, unknown> | undefined;
  const optOut = await osmFeatures.routes_optimized_path(
    {
      start: { lon: 18.075, lat: 59.316 },
      stops: [{ lng: 18.08, lat: 59.318 }],
      travelMode: 'BICYCLE',
    },
    {
      fetchFn: async (input, init) => {
        optUrl = toUrl(input).pathname;
        optBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ status: 'ok' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(optOut['status'], 'ok');
  assert.equal(optUrl, '/v1/routes/optimized_path');
  assert.deepEqual(optBody?.['start'], { lon: 18.075, lat: 59.316 });
  assert.deepEqual(optBody?.['stops'], [{ lon: 18.08, lat: 59.318 }]);
  assert.equal('loop' in (optBody ?? {}), false);
  assert.equal(optBody?.['travelMode'], 'BICYCLE');

  assert.equal(isOpenNow({ properties: { openNow: true } }), true);
  assert.equal(isOpenNow({ properties: { openNow: false } }), false);
  assert.equal(isOpenNow({ properties: {} }), false);
  assert.equal(isOpenNow(undefined), false);
  assert.equal(isOpenNow({ feature: { properties: { openNow: true } } }), true);
  assert.equal(isOpenNow({ feature: { properties: { openNow: false } } }), false);
  assert.equal(readOpenNow({ properties: { openNow: true } }), true);
  assert.equal(readOpenNow({ properties: { openNow: false } }), false);
  assert.equal(readOpenNow({ properties: {} }), undefined);
  assert.equal(readOpenNow({ feature: { properties: { openNow: false } } }), false);
  assert.equal(readOpenNow(undefined), undefined);
  assert.deepEqual(
    [
      { properties: { openNow: true } },
      { properties: { openNow: false } },
      { properties: {} },
    ].filter(isOpenNow).map((f) => f.properties?.['openNow']),
    [true],
  );

  console.log('osmfeatures checks passed');
}

void main();
