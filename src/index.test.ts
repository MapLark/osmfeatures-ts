import assert from 'node:assert/strict';
import {
  DEFAULT_TIMEOUT_MS,
  OSMFeatures,
  around_to_bbox,
  tagValue,
  tagValues,
  isOpenNow,
  readOpenNow,
  resolveBboxTiles,
  splitBbox,
  type OSMFeaturesLayer,
  type OSMGeoJSONPayload,
} from './index.js';

assert.equal(DEFAULT_TIMEOUT_MS, 610_000);

assert.deepEqual(tagValues('a|b'), ['a|b']);
assert.deepEqual(tagValues(['a']), ['a']);
assert.deepEqual(tagValues(['a', 'b']), ['a', 'b']);
assert.deepEqual(tagValues(['a|b', 'c']), ['a|b', 'c']);
assert.deepEqual(tagValues([]), []);
assert.equal(tagValue(['amenity', 'a=1|b=2', '!access=private']), 'amenity,a=1|b=2,!access=private');
assert.equal(tagValue(['a|(b,c)', 'd']), 'a|(b,c),d');
assert.equal(tagValue([]), undefined);

type AppError = Error & {
  status?: number;
  code?: string;
  subtype?: string;
  units?: number;
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
  tags: ['amenity=restaurant|amenity=cafe'],
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

function accountTier(maxLimit = 75_000): Response {
  return new Response(
    JSON.stringify({ id: 'free', label: 'Free', max_limit: maxLimit }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function freshClient(): OSMFeatures {
  return new OSMFeatures('demo-key', {
    apiBaseUrl: 'https://demo.example.com',
    timeoutMs: 1_000,
  });
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
  assert.equal(resolveBboxTiles({ bboxTiles: '4' }), 4);
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

  const relayRequest = osmFeatures.resolveRequest({
    limit: '10',
    bbox_tiles: '2',
    auto_split: 'true',
    timeout: '30',
    accept: 'application/geo+json',
    clipGeometry: 'true',
  }, { bbox: '0,0,2,1', tags: ['building'] });
  assert.equal(relayRequest.limit, 10);
  assert.equal(relayRequest.bboxTiles, 2);
  assert.equal(relayRequest.autoSplit, true);
  assert.equal(relayRequest.timeout, 30);
  assert.equal(relayRequest.accept, 'application/geo+json');
  assert.equal(relayRequest.clipGeometry, true);
  assert.equal(relayRequest.splitUntilFit, undefined);

  const relayAliases = osmFeatures.resolveRequest(
    new URLSearchParams(
      'limit=25&bboxTiles=4&autoSplit=false&split_until_fit=true&timeout=null&accept=application/flatgeobuf&clip_geometry=false',
    ),
    buildingsLayer,
  );
  assert.equal(relayAliases.limit, 25);
  assert.equal(relayAliases.bboxTiles, 4);
  assert.equal(relayAliases.autoSplit, false);
  assert.equal(relayAliases.splitUntilFit, true);
  assert.equal(relayAliases.timeout, null);
  assert.equal(relayAliases.accept, 'application/flatgeobuf');
  assert.equal(relayAliases.clipGeometry, false);

  await assert.rejects(
    async () => osmFeatures.resolveRequest({ bbox_tiles: '3' }, buildingsLayer),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.status, 400);
      assert.equal(appError.code, 'invalid_bbox_tiles');
      return true;
    },
  );

  const taggedLayer: OSMFeaturesLayer = {
    bbox: buildingsLayer.bbox,
    tags: ['highway', '!highway=footway', '!highway=path'],
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
  assert.deepEqual(
    taggedUrls[0]?.searchParams.getAll('tags') ?? [],
    ['highway,!highway=footway,!highway=path'],
  );

  const andOrUrls: URL[] = [];
  await osmFeatures.query(
    {
      bbox: buildingsLayer.bbox,
      tags: ['amenity=cafe|amenity=bar', 'wheelchair=yes'],
    },
    {
      fetchFn: async (input) => {
        andOrUrls.push(toUrl(input));
        return geojsonPage([]);
      },
    },
  );
  assert.deepEqual(
    andOrUrls[0]?.searchParams.getAll('tags') ?? [],
    ['amenity=cafe|amenity=bar,wheelchair=yes'],
  );

  const minAreaRequest = osmFeatures.resolveRequest({
    zoom: '11',
    min_area_m2: '250',
    max_area_m2: '9000',
    min_length_m: '12.5',
    max_length_m: '500',
    disable_budget_warning: 'true',
    centroid: 'true',
    clipGeometry: 'true',
  }, buildingsLayer);
  assert.equal(minAreaRequest.minAreaM2, 250);
  assert.equal(minAreaRequest.centroid, true);
  assert.equal(minAreaRequest.clipGeometry, true);
  assert.equal(minAreaRequest.bbox, buildingsLayer.bbox);
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
  assert.equal(minAreaUrls[0]?.searchParams.get('bbox'), buildingsLayer.bbox);
  assert.equal(minAreaUrls[0]?.searchParams.get('location'), null);
  assert.equal(minAreaUrls[0]?.searchParams.get('osm_ids'), null);
  assert.equal(minAreaUrls[0]?.searchParams.get('disable_budget_warning'), null);
  assert.equal(minAreaUrls[0]?.searchParams.get('centroid'), 'true');
  assert.equal(minAreaUrls[0]?.searchParams.get('clipGeometry'), 'true');

  const radiusFromLayer = osmFeatures.resolveRequest({
    location: '59.33,18.06',
    radius: '250',
  }, buildingsLayer);
  assert.equal(radiusFromLayer.bbox, undefined);
  assert.equal(radiusFromLayer.location, '59.33,18.06');
  assert.equal(radiusFromLayer.radius, 250);
  assert.deepEqual(radiusFromLayer.tags, ['building']);

  const idsFromLayer = osmFeatures.resolveRequest({ osm_ids: '111, 222' }, buildingsLayer);
  assert.equal(idsFromLayer.bbox, undefined);
  assert.equal(idsFromLayer.tags, undefined);
  assert.equal(idsFromLayer.osmIds, '111, 222');
  const idLookupUrls: URL[] = [];
  await osmFeatures.query(idsFromLayer, {
    fetchFn: async (input) => {
      idLookupUrls.push(toUrl(input));
      return geojsonPage([]);
    },
  });
  assert.equal(idLookupUrls[0]?.searchParams.get('osm_ids'), '111, 222');
  assert.equal(idLookupUrls[0]?.searchParams.get('bbox'), null);
  assert.equal(idLookupUrls[0]?.searchParams.get('tags'), null);

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

  const atomicUrls: URL[] = [];
  const atomic = await osmFeatures.query(
    { bbox: '0,0,1,1', tags: ['building'] },
    {
      fetchFn: async (input) => {
        atomicUrls.push(toUrl(input));
        return geojsonPage([feature('way/1')]);
      },
    },
  );
  assert.ok(!(atomic.data instanceof ArrayBuffer));
  assert.deepEqual(atomicUrls.map((url) => url.pathname), ['/v3/osm_features']);
  assert.equal(atomicUrls[0]?.searchParams.get('bbox'), '0,0,1,1');
  assert.deepEqual(atomic.data.features, [feature('way/1')]);

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

  await assert.rejects(
    async () => osmFeatures.query({
      bbox: '0,0,1,1',
      location: '59.33,18.06',
      radius: 250,
      tags: ['building'],
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.code, 'invalid_spatial');
      return true;
    },
  );

  await assert.rejects(
    async () => osmFeatures.query({
      bbox: '0,0,1,1',
      osmIds: '111,222',
      tags: ['building'],
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.code, 'invalid_spatial');
      return true;
    },
  );

  await assert.rejects(
    async () => osmFeatures.query({
      location: '59.33,18.06',
      radius: 250,
      tags: ['building'],
      autoSplit: true,
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.code, 'invalid_auto_split');
      return true;
    },
  );

  await assert.rejects(
    async () => osmFeatures.count({
      bbox: '0,0,1,1',
      location: '59.33,18.06',
      radius: 250,
      tags: ['building'],
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.code, 'invalid_spatial');
      return true;
    },
  );

  const statsResolved = osmFeatures.resolveCountRequest(
    new URLSearchParams('within=relation/398021&tags=amenity&tags=building&group_by=amenity&limit=20'),
  );
  assert.equal(statsResolved.groupBy, 'amenity');
  assert.equal(statsResolved.within, 'relation/398021');
  assert.equal(statsResolved.tags, 'amenity,building');
  assert.equal(statsResolved.limit, 20);

  const scalarResolved = osmFeatures.resolveCountRequest(
    new URLSearchParams('bbox=18.06,59.32,18.09,59.34&tags=amenity'),
  );
  assert.equal(scalarResolved.groupBy, undefined);
  assert.equal(scalarResolved.bbox, '18.06,59.32,18.09,59.34');
  assert.equal(scalarResolved.tags, 'amenity');
  assert.throws(
    () => osmFeatures.resolveCountRequest(new URLSearchParams('bbox=18.06,59.32,18.09,59.34&or_tags=amenity=cafe')),
    (error: unknown) => (error as { code?: string }).code === 'invalid_tags',
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

  const scalarUrls: URL[] = [];
  const scalarOut = await osmFeatures.count(
    { bbox: '18.06,59.32,18.09,59.34', tags: ['amenity'] },
    {
      fetchFn: async (input) => {
        scalarUrls.push(toUrl(input));
        return new Response(
          JSON.stringify({ groups: [], total: 42, truncated: false }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(scalarOut.total, 42);
  assert.deepEqual(scalarOut.groups, []);
  assert.equal(scalarUrls[0]?.searchParams.get('group_by'), null);

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

  const densityResolved = osmFeatures.resolveDensityRequest(
    new URLSearchParams('bbox=-26,33,52,72&tags=place&cell_deg=0.1&disable_budget_warning=true'),
  );
  assert.equal(densityResolved.cellDeg, 0.1);
  assert.equal(densityResolved.bbox, '-26,33,52,72');
  assert.equal(densityResolved.tags, 'place');
  assert.equal(densityResolved.disableBudgetWarning, true);
  assert.equal('groupBy' in densityResolved, false);

  const densityUrls: URL[] = [];
  const densityOut = await osmFeatures.density(
    {
      bbox: '18.06,59.32,18.09,59.34',
      tags: ['place'],
      cellDeg: 0.1,
      type: 'node',
    },
    {
      fetchFn: async (input) => {
        densityUrls.push(toUrl(input));
        return new Response(
          JSON.stringify({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [18.1, 59.3] },
              properties: { count: 4 },
            }],
            total: 4,
            truncated: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json', 'X-Usage-Units-Charged': '11' } },
        );
      },
    },
  );
  assert.equal(densityOut.total, 4);
  assert.equal(densityOut.response_headers?.['x-usage-units-charged'], '11');
  assert.equal(densityOut.features[0]?.properties.count, 4);
  assert.equal(densityOut.features[0]?.geometry.type, 'Point');
  assert.equal('id' in (densityOut.features[0] ?? {}), false);
  assert.equal(densityUrls[0]?.pathname, '/v2/osm_features/density');
  assert.equal(densityUrls[0]?.searchParams.get('cell_deg'), '0.1');
  assert.equal(densityUrls[0]?.searchParams.get('group_by'), null);
  assert.deepEqual(densityUrls[0]?.searchParams.getAll('tags'), ['place']);

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
  assert.equal(billed.meta.response_headers?.['x-usage-units-charged'], '42');

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

  const monthlyResponses = [
    new Response(
      JSON.stringify({
        error: 'too_many_requests',
        subtype: 'rate_limit_monthly',
        detail: 'Need 50 credits; 1 remaining this month.',
        units: 50,
      }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    ),
    geojsonPage([feature('must-not-run')]),
  ];
  await assert.rejects(
    async () => osmFeatures.query(foodLayer, {
      fetchFn: async () => {
        const response = monthlyResponses.shift();
        if (!response) {
          throw new Error('monthly 429 must not retry');
        }
        return response;
      },
      sleepFn: async () => {
        throw new Error('monthly 429 must not sleep');
      },
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.status, 429);
      assert.equal(appError.subtype, 'rate_limit_monthly');
      assert.equal(appError.units, 50);
      assert.equal(appError.upstreamDetail, 'Need 50 credits; 1 remaining this month.');
      assert.equal(monthlyResponses.length, 1);
      return true;
    },
  );

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

  const around = around_to_bbox(18.065, 59.33, 1000).split(',').map(Number);
  assert.equal(around.length, 4);
  assert.ok(around[0]! < 18.065 && 18.065 < around[2]!);
  assert.ok(around[1]! < 59.33 && 59.33 < around[3]!);
  const aroundSmall = around_to_bbox(0, 0, 500).split(',').map(Number);
  const aroundLarge = around_to_bbox(0, 0, 5000).split(',').map(Number);
  const area = (b: number[]) => (b[2]! - b[0]!) * (b[3]! - b[1]!);
  assert.ok(area(aroundLarge) > area(aroundSmall));

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
        return geojsonPage([feature('way/1')], 2);
      }
      return geojsonPage([feature('way/2')], 7);
    },
  });
  assert.ok(!(tiledPayload.data instanceof ArrayBuffer));
  assert.deepEqual(tiledUrls.map((url) => url.searchParams.get('bbox')), expectedTiles);
  assert.deepEqual(tiledUrls.map((url) => url.pathname), ['/v3/osm_features', '/v3/osm_features']);
  assert.deepEqual(tiledPayload.data.features, [feature('way/1'), feature('way/2')]);
  assert.equal(tiledPayload.meta.has_more, false);
  assert.equal(tiledPayload.meta.response_headers, undefined);

  const overflowBbox = '0,0,2,2';
  const overflowTiles = splitBbox(overflowBbox, 4);
  const overflowLeaves = splitBbox(overflowTiles[2]!, 4);
  const overflowFeatureQueue = [
    geojsonPage([feature('way/0')]),
    geojsonPage([feature('way/1')]),
    geojsonPage([feature('way/3')]),
    geojsonPage([feature('way/20')]),
    geojsonPage([feature('way/21')]),
    geojsonPage([feature('way/22')]),
    geojsonPage([feature('way/23')]),
  ];
  const overflowStatsQueue = [
    statsTotal(1),
    statsTotal(1),
    statsTotal(200_000),
    statsTotal(1),
    statsTotal(1),
    statsTotal(1),
    statsTotal(1),
    statsTotal(1),
  ];
  const overflowUrls: URL[] = [];
  const overflow = await freshClient().query({
    bbox: overflowBbox,
    bboxTiles: 4,
    tags: ['building'],
    autoSplit: true,
  }, {
    fetchFn: async (input) => {
      const url = toUrl(input);
      overflowUrls.push(url);
      if (url.pathname === '/v1/account/tier') {
        return accountTier();
      }
      if (url.pathname === '/v2/osm_features/count') {
        assert.equal(url.searchParams.get('group_by'), null);
        assert.equal(url.searchParams.get('tags'), 'building');
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
    (overflow.data.features as { id: string }[]).map((item) => item.id),
    ['way/0', 'way/1', 'way/3', 'way/20', 'way/21', 'way/22', 'way/23'],
  );
  const featureBboxes = overflowUrls
    .filter((url) => url.pathname === '/v3/osm_features')
    .map((url) => url.searchParams.get('bbox'));
  assert.deepEqual(featureBboxes, [
    overflowTiles[0], overflowTiles[1], overflowTiles[3],
    ...overflowLeaves,
  ]);
  assert.equal(overflow.meta.response_headers, undefined);
  assert.equal(featureBboxes.includes(overflowTiles[2]!), false);
  assert.deepEqual(
    overflowUrls
      .filter((url) => url.pathname === '/v2/osm_features/count')
      .map((url) => url.searchParams.get('bbox')),
    [...overflowTiles, ...overflowLeaves],
  );
  assert.equal(overflowUrls[0]?.pathname, '/v1/account/tier');

  const capBbox = '0,0,1,1';
  const capLeaves = splitBbox(capBbox, 32);
  let capFetches = 0;
  const capped = await freshClient().query({
    bbox: capBbox,
    tags: ['building'],
    autoSplit: true,
  }, {
    fetchFn: async (input) => {
      const url = toUrl(input);
      if (url.pathname === '/v1/account/tier') {
        return accountTier();
      }
      if (url.pathname === '/v2/osm_features/count') {
        return url.searchParams.get('bbox') === capBbox
          ? statsTotal(1_275_000)
          : statsTotal(1);
      }
      capFetches += 1;
      return geojsonPage([feature(`way/${capFetches}`)]);
    },
  });
  assert.ok(!(capped.data instanceof ArrayBuffer));
  assert.equal(capFetches, 32);
  assert.equal(capped.data.features.length, 32);
  assert.deepEqual(
    (capped.data.features as { id: string }[]).map((item) => item.id),
    capLeaves.map((_, i) => `way/${i + 1}`),
  );

  let leftoverFetches = 0;
  await assert.rejects(
    async () => freshClient().query({
      bbox: capBbox,
      tags: ['building'],
      autoSplit: true,
    }, {
      fetchFn: async (input) => {
        const url = toUrl(input);
        if (url.pathname === '/v1/account/tier') {
          return accountTier();
        }
        if (url.pathname === '/v2/osm_features/count') {
          const tile = url.searchParams.get('bbox');
          if (tile === capBbox) {
            return statsTotal(1_275_000);
          }
          if (tile === capLeaves[capLeaves.length - 1]) {
            return statsTotal(200_000);
          }
          return statsTotal(1);
        }
        leftoverFetches += 1;
        return geojsonPage([feature(`way/${leftoverFetches}`)]);
      },
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.code, 'too_dense');
      assert.match(appError.message, /too dense/);
      return true;
    },
  );
  assert.equal(leftoverFetches, 31);

  // ceil(total / 75_000) === 2**31 + 1. `1 << 32` wraps to 1 and would
  // re-enqueue the same tile; `2 ** 32` stays > MAX_SPLIT_TILES.
  const wrapCountUrls: string[] = [];
  await assert.rejects(
    async () => freshClient().query({
      bbox: '0,0,1,1',
      tags: ['building'],
      autoSplit: true,
    }, {
      fetchFn: async (input) => {
        const url = toUrl(input);
        wrapCountUrls.push(url.pathname);
        if (url.pathname === '/v1/account/tier') {
          return accountTier();
        }
        if (url.pathname === '/v2/osm_features/count') {
          return statsTotal(75_000 * ((2 ** 31) + 1));
        }
        throw new Error('wrap-around autoSplit must not fetch features');
      },
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.code, 'too_dense');
      return true;
    },
  );
  assert.deepEqual(wrapCountUrls, ['/v1/account/tier', '/v2/osm_features/count']);

  const pageLimitUrls: URL[] = [];
  const pageLimited = await freshClient().query({
    bbox: '0,0,1,1',
    tags: ['building'],
    limit: 10,
    autoSplit: true,
  }, {
    fetchFn: async (input) => {
      const url = toUrl(input);
      pageLimitUrls.push(url);
      if (url.pathname === '/v1/account/tier') {
        return accountTier();
      }
      if (url.pathname === '/v2/osm_features/count') {
        return statsTotal(20);
      }
      return jsonResponse(
        { type: 'FeatureCollection', features: [feature('way/1')] },
        { headers: { ...resultHeaders(1), 'X-Has-More': 'true' } },
      );
    },
  });
  assert.ok(!(pageLimited.data instanceof ArrayBuffer));
  assert.deepEqual(
    (pageLimited.data.features as { id: string }[]).map((item) => item.id),
    ['way/1'],
  );
  assert.equal(pageLimited.meta.has_more, true);
  assert.deepEqual(
    pageLimitUrls.map((url) => url.pathname),
    ['/v1/account/tier', '/v2/osm_features/count', '/v3/osm_features'],
  );
  assert.equal(pageLimitUrls[2]?.searchParams.get('limit'), '10');

  await assert.rejects(
    async () => freshClient().query({
      bbox: '0,0,1,1',
      tags: ['building'],
      autoSplit: true,
    }, {
      fetchFn: async (input) => {
        const url = toUrl(input);
        if (url.pathname === '/v1/account/tier') {
          return accountTier();
        }
        if (url.pathname === '/v2/osm_features/count') {
          return statsTotal(1);
        }
        return tooLargeResponse();
      },
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.code, 'too_dense');
      assert.match(appError.message, /too dense/);
      return true;
    },
  );

  const countWindowUrls: string[] = [];
  await assert.rejects(
    async () => freshClient().query({
      bbox: '0,0,30,20',
      tags: ['building'],
      autoSplit: true,
    }, {
      fetchFn: async (input) => {
        const url = toUrl(input);
        countWindowUrls.push(url.pathname);
        if (url.pathname === '/v1/account/tier') {
          return accountTier();
        }
        return new Response(JSON.stringify({
          error: 'bad_request',
          detail: 'count bbox area 500.000000 exceeds the tagged tier limit 400.000000 for the \'free\' tier.',
          status_code: 400,
        }), { status: 400, headers: { 'content-type': 'application/json' } });
      },
    }),
    (error: unknown) => {
      const appError = error as AppError;
      assert.equal(appError.status, 400);
      assert.match(appError.message, /count bbox area/);
      assert.doesNotMatch(appError.message, /autoSplit/);
      return true;
    },
  );
  assert.deepEqual(countWindowUrls, ['/v1/account/tier', '/v2/osm_features/count']);

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
      assert.equal(appError.subtype, 'result_too_large');
      assert.doesNotMatch(appError.message, /autoSplit/);
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
      assert.equal(appError.subtype, 'result_too_large');
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
  assert.equal(binary.meta.response_headers?.['x-usage-units-charged'], '7');

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
  const searchPaths: string[] = [];
  const searchOut = await osmFeatures.places_search(
    {
      location: { lat: 59.316, lon: 18.075 },
      radius: 500,
      tags: ['amenity=cafe'],
      openNow: true,
      asOf: '2026-08-10T18:00:00+02:00',
      limit: 10,
    },
    {
      fetchFn: async (input, init) => {
        const url = toUrl(input);
        searchPaths.push(url.pathname);
        searchUrl = url.pathname;
        searchBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            type: 'FeatureCollection',
            features: [],
            metadata: { units: 1, evaluated_at: '2026-08-10T16:00:00Z' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(searchOut['type'], 'FeatureCollection');
  assert.equal((searchOut['metadata'] as { units: number }).units, 1);
  assert.equal(searchUrl, '/v1/places/search');
  assert.deepEqual(searchPaths, ['/v1/places/search']);
  assert.deepEqual(searchBody?.['location'], { lat: 59.316, lng: 18.075 });
  assert.deepEqual(searchBody?.['tags'], ['amenity=cafe']);
  assert.equal(searchBody?.['openNow'], true);
  assert.equal(searchBody?.['asOf'], '2026-08-10T18:00:00+02:00');
  assert.equal(searchBody?.['limit'], 10);

  let andSearchBody: Record<string, unknown> | undefined;
  await osmFeatures.places_search(
    {
      bbox: '0,0,1,1',
      tags: ['amenity=cafe|amenity=bar', '!cuisine'],
    },
    {
      fetchFn: async (_input, init) => {
        andSearchBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ type: 'FeatureCollection', features: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.deepEqual(andSearchBody?.['tags'], ['amenity=cafe|amenity=bar', '!cuisine']);

  const tileBbox = '0,0,2,1';
  const placeTiles = splitBbox(tileBbox, 2);
  const placeTileBodies: Record<string, unknown>[] = [];
  const tiledPlaces = await freshClient().places_search(
    { bbox: tileBbox, tags: ['amenity=cafe'], bboxTiles: 2 },
    {
      fetchFn: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        placeTileBodies.push(body);
        const id = body['bbox'] === placeTiles[0] ? 'node/1' : 'node/2';
        const units = id === 'node/1' ? 2 : 7;
        return new Response(JSON.stringify({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', id, geometry: null, properties: {} }],
          metadata: {
            units,
            evaluated_at: id === 'node/1' ? '2026-08-10T16:00:00Z' : '2026-08-10T16:00:01Z',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.deepEqual(
    (tiledPlaces['features'] as { id: string }[]).map((item) => item.id),
    ['node/1', 'node/2'],
  );
  assert.deepEqual(placeTileBodies.map((body) => body['bbox']), placeTiles);
  assert.equal('bboxTiles' in (placeTileBodies[0] ?? {}), false);
  assert.equal((tiledPlaces['metadata'] as { units: number }).units, 9);
  assert.equal(
    (tiledPlaces['metadata'] as { evaluated_at: string }).evaluated_at,
    '2026-08-10T16:00:00Z',
  );

  const namelessPlaces = await freshClient().places_search(
    { bbox: tileBbox, tags: ['amenity=cafe'], bboxTiles: 2 },
    {
      fetchFn: async () => new Response(JSON.stringify({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: null, properties: { name: 'anon' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    },
  );
  assert.equal((namelessPlaces['features'] as unknown[]).length, 2);

  await assert.rejects(
    async () => freshClient().places_search({
      location: { lat: 59.3, lng: 18.0 },
      radius: 500,
      tags: ['amenity=cafe'],
      autoSplit: true,
    }),
    (error: unknown) => {
      assert.match((error as Error).message, /autoSplit only applies to bbox search/);
      return true;
    },
  );

  const areaBbox = '0,0,2,2';
  const areaQuarters = splitBbox(areaBbox, 4);
  const areaPaths: string[] = [];
  const areaSearchBboxes: string[] = [];
  const areaSplit = await freshClient().places_search(
    { bbox: areaBbox, tags: ['amenity=cafe'], autoSplit: true },
    {
      fetchFn: async (input, init) => {
        const url = toUrl(input);
        areaPaths.push(url.pathname);
        if (url.pathname === '/v1/account/tier') {
          return accountTier();
        }
        if (url.pathname === '/v2/osm_features/count') {
          assert.equal(url.searchParams.get('way_shape'), 'polygon');
          assert.equal(url.searchParams.get('tags'), 'amenity=cafe');
          assert.equal(url.searchParams.get('type'), null);
          assert.equal(url.searchParams.get('group_by'), null);
          return statsTotal(1);
        }
        const body = JSON.parse(String(init?.body)) as { bbox: string };
        areaSearchBboxes.push(body.bbox);
        const width = body.bbox.split(',').map((value) => Number.parseFloat(value));
        const area = (width[2]! - width[0]!) * (width[3]! - width[1]!);
        if (area > 1) {
          return new Response(JSON.stringify({
            error: 'bad_request',
            detail: `bbox area ${area.toFixed(6)} exceeds the tagged tier limit 1.000000 for the 'free' tier.`,
            status_code: 400,
          }), { status: 400, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', id: `node/${areaSearchBboxes.length}`, geometry: null, properties: {} }],
          metadata: { units: 1 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.equal(areaSplit['features'] && (areaSplit['features'] as unknown[]).length, 4);
  assert.deepEqual(areaSearchBboxes, [areaBbox, ...areaQuarters]);
  assert.equal(areaPaths.includes('/v1/places/count'), false);
  assert.equal(areaPaths[0], '/v1/account/tier');

  const hoursPaths: string[] = [];
  let hoursCount = '';
  let hoursBody: Record<string, unknown> = {};
  await freshClient().places_search(
    {
      bbox: '0,0,1,1',
      tags: ['amenity=cafe'],
      asOf: '2026-08-10T18:00:00+02:00',
      autoSplit: true,
    },
    {
      fetchFn: async (input, init) => {
        const url = toUrl(input);
        hoursPaths.push(url.pathname);
        if (url.pathname === '/v2/osm_features/count') {
          hoursCount = url.search;
          return statsTotal(15_000);
        }
        hoursBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', id: 'node/1', geometry: null, properties: {} }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.deepEqual(hoursPaths, ['/v2/osm_features/count', '/v1/places/search']);
  assert.deepEqual(
    new URLSearchParams(hoursCount).getAll('tags'),
    ['amenity=cafe,opening_hours'],
  );
  assert.match(hoursCount, /way_shape=polygon/);
  assert.equal(hoursBody['asOf'], '2026-08-10T18:00:00+02:00');
  assert.deepEqual(hoursBody['tags'], ['amenity=cafe']);

  const openNowBbox = '0,0,1,1';
  const openNowTiles = splitBbox(openNowBbox, 2);
  const openNowSearch: string[] = [];
  const openNowSplit = await freshClient().places_search(
    { bbox: openNowBbox, tags: ['amenity=cafe'], openNow: true, limit: 10, autoSplit: true },
    {
      fetchFn: async (input, init) => {
        const url = toUrl(input);
        if (url.pathname === '/v1/account/tier') {
          throw new Error('openNow autoSplit must not fetch account tier');
        }
        if (url.pathname === '/v2/osm_features/count') {
          const total = url.searchParams.get('bbox') === openNowBbox ? 15_000 : 100;
          return statsTotal(total);
        }
        const body = JSON.parse(String(init?.body)) as { bbox: string; limit?: number };
        openNowSearch.push(body.bbox);
        assert.equal(body.limit, 10);
        return new Response(JSON.stringify({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', id: `node/${openNowSearch.length}`, geometry: null, properties: {} }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.equal((openNowSplit['features'] as unknown[]).length, 2);
  assert.deepEqual(openNowSearch, openNowTiles);

  const placeCountUrls: URL[] = [];
  let placeSearchBody: Record<string, unknown> = {};
  await freshClient().places_search(
    { bbox: '0,0,1,1', tags: ['amenity=cafe'], autoSplit: true },
    {
      fetchFn: async (input, init) => {
        const url = toUrl(input);
        placeCountUrls.push(url);
        if (url.pathname === '/v1/account/tier') {
          return accountTier();
        }
        if (url.pathname === '/v2/osm_features/count') {
          assert.equal(url.searchParams.get('type'), null);
          assert.equal(url.searchParams.get('way_shape'), 'polygon');
          assert.equal(url.searchParams.get('tags'), 'amenity=cafe');
          return statsTotal(1);
        }
        placeSearchBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', id: 'node/1', geometry: null, properties: {} }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.deepEqual(
    placeCountUrls.map((url) => url.pathname),
    ['/v1/account/tier', '/v2/osm_features/count', '/v1/places/search'],
  );
  assert.equal('type' in placeSearchBody, false);

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
          JSON.stringify({ status: 'ok', items: [], units: 2 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(nearbyOut['status'], 'ok');
  assert.equal(nearbyOut['units'], 2);
  assert.equal(nearbyUrl, '/v1/places/nearby');
  assert.equal(nearbyBody?.['openNow'], true);
  assert.equal(nearbyBody?.['asOf'], '2026-08-10T18:00:00+02:00');
  assert.equal(nearbyBody?.['limit'], 3);
  assert.equal('radius' in (nearbyBody ?? {}), false);
  assert.equal('type' in (nearbyBody ?? {}), false);

  let detailsUrl = '';
  const detailsOut = await osmFeatures.places_details(
    { osmType: 'node/123' },
    {
      fetchFn: async (input) => {
        detailsUrl = toUrl(input).pathname;
        return new Response(
          JSON.stringify({ status: 'ok', feature: { id: 'node/123' }, units: 1 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(detailsOut['status'], 'ok');
  assert.equal(detailsOut['units'], 1);
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

  const tierClient = freshClient();
  let tierNow = 1_000_000;
  const tierPaths: string[] = [];
  const tierFetch: typeof fetch = async (input) => {
    const url = toUrl(input);
    tierPaths.push(url.pathname);
    const n = tierPaths.filter((path) => path === '/v1/account/tier').length;
    return accountTier(n === 1 ? 75_000 : 200_000);
  };
  const firstTier = await tierClient.account_tier({ fetchFn: tierFetch, nowFn: () => tierNow });
  const cachedTier = await tierClient.account_tier({
    fetchFn: tierFetch,
    nowFn: () => tierNow + 60_000,
  });
  assert.equal(firstTier['max_limit'], 75_000);
  assert.equal(cachedTier['max_limit'], 75_000);
  firstTier['max_limit'] = 1;
  const cachedAfterMutate = await tierClient.account_tier({
    fetchFn: tierFetch,
    nowFn: () => tierNow + 90_000,
  });
  assert.equal(cachedAfterMutate['max_limit'], 75_000);
  assert.deepEqual(tierPaths, ['/v1/account/tier']);
  tierNow += 5 * 60 * 1000;
  const refreshedTier = await tierClient.account_tier({ fetchFn: tierFetch, nowFn: () => tierNow });
  assert.equal(refreshedTier['max_limit'], 200_000);
  assert.deepEqual(tierPaths, ['/v1/account/tier', '/v1/account/tier']);

  let isoUrl = '';
  let isoBody: Record<string, unknown> | undefined;
  const isoOut = await osmFeatures.routes_isochrone(
    { origin: { lon: 18.075, lat: 59.316 }, maxDistanceM: 500 },
    {
      fetchFn: async (input, init) => {
        isoUrl = toUrl(input).pathname;
        isoBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ status: 'ok', geometry: { type: 'Polygon', coordinates: [] }, units: 4 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(isoOut['status'], 'ok');
  assert.equal(isoOut['units'], 4);
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
          JSON.stringify({ status: 'ok', geometry: { type: 'LineString', coordinates: [] }, units: 6 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(pathOut['status'], 'ok');
  assert.equal(pathOut['units'], 6);
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
          JSON.stringify({ status: 'ok', units: 8 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(optOut['status'], 'ok');
  assert.equal(optOut['units'], 8);
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
