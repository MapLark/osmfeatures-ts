import assert from 'node:assert/strict';
import { MAX_COMPARISONS, nearest_within } from './nearest.js';

function point(fid: string, lon: number, lat: number) {
  return {
    type: 'Feature',
    id: fid,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {},
  };
}

function polygonWithCentroid(fid: string, lon: number, lat: number) {
  return {
    type: 'Feature',
    id: fid,
    geometry: {
      type: 'Polygon',
      coordinates: [[[lon, lat], [lon + 0.01, lat], [lon + 0.01, lat + 0.01], [lon, lat]]],
    },
    properties: { centroid: { type: 'Point', coordinates: [lon, lat] } },
  };
}

{
  const primary = [point('node/1', 18.07, 59.33)];
  const close = point('node/10', 18.0705, 59.33);
  const far = point('node/11', 18.09, 59.33);
  const out = nearest_within(primary, [far, close], 500);
  assert.equal(out.length, 1);
  assert.equal((out[0]!.nearest as { id: string }).id, 'node/10');
  assert.ok(out[0]!.distance_m < 50);
}

{
  const far = point('node/11', 18.09, 59.33);
  assert.deepEqual(nearest_within([point('node/1', 18.07, 59.33)], [far], 50), []);
}

{
  const primaries = [
    point('node/1', 18.07, 59.33),
    point('node/2', 18.071, 59.33),
    point('node/3', 18.08, 59.33),
  ];
  const stations = [point('node/99', 18.07, 59.33)];
  const out = nearest_within(primaries, stations, 2000, { limit: 2 });
  assert.equal(out.length, 2);
  assert.equal((out[0]!.feature as { id: string }).id, 'node/1');
  assert.equal((out[1]!.feature as { id: string }).id, 'node/2');
  assert.ok(out[0]!.distance_m <= out[1]!.distance_m);
}

{
  const park = polygonWithCentroid('way/1', 18.07, 59.33);
  const cafe = point('node/2', 18.0702, 59.33);
  const out = nearest_within(
    { type: 'FeatureCollection', features: [park] },
    [cafe],
    100,
  );
  assert.equal(out.length, 1);
  assert.equal((out[0]!.feature as { id: string }).id, 'way/1');
  assert.equal((out[0]!.nearest as { id: string }).id, 'node/2');
}

{
  const primaries = Array.from({ length: 21 }, (_, i) => point(`node/${i}`, 18.07 + i * 0.0001, 59.33));
  const out = nearest_within(primaries, [point('node/99', 18.07, 59.33)], 2000);
  assert.equal(out.length, 20);
}

{
  const primaries = Array.from({ length: 25 }, (_, i) => point(`node/${i}`, 18.07 + i * 0.0001, 59.33));
  const out = nearest_within(primaries, [point('node/99', 18.07, 59.33)], 2000, { limit: null });
  assert.equal(out.length, 25);
}

assert.throws(
  () => nearest_within([point('node/1', 18.07, 59.33)], [point('node/2', 18.07, 59.33)], 100, { limit: 0 }),
  { message: /positive/ },
);

{
  const primaries = Array.from({ length: 5 }, (_, i) => point(`node/p${i}`, 18.07, 59.33));
  const secondaries = Array.from({ length: 5 }, (_, i) => point(`node/s${i}`, 18.07, 59.33));
  assert.throws(
    () => nearest_within(primaries, secondaries, 2000, { maxComparisons: 20 }),
    { message: /5×5 comparisons/ },
  );
}

{
  const primaries = Array.from({ length: 5 }, (_, i) => point(`node/p${i}`, 18.07, 59.33));
  const secondaries = Array.from({ length: 4 }, (_, i) => point(`node/s${i}`, 18.07, 59.33));
  const out = nearest_within(primaries, secondaries, 2000, { limit: null, maxComparisons: 20 });
  assert.equal(out.length, 5);
}

{
  const primaries = Array.from({ length: 5 }, (_, i) => point(`node/p${i}`, 18.07, 59.33));
  const secondaries = Array.from({ length: 5 }, (_, i) => point(`node/s${i}`, 18.07, 59.33));
  const out = nearest_within(primaries, secondaries, 2000, { limit: null, maxComparisons: null });
  assert.equal(out.length, 5);
}

assert.throws(
  () => nearest_within(
    [point('node/1', 18.07, 59.33)],
    [point('node/2', 18.07, 59.33)],
    100,
    { maxComparisons: 0 },
  ),
  { message: /max_comparisons/ },
);

assert.equal(MAX_COMPARISONS, 500_000);
assert.deepEqual(nearest_within([point('node/1', 18.07, 59.33)], [], 100), []);

{
  const cafe = point('node/2', 18.0702, 59.33);
  const park = polygonWithCentroid('way/1', 18.07, 59.33);
  const page = { data: { type: 'FeatureCollection', features: [park] }, meta: { returned: 1 } };
  const out = nearest_within(page, { data: { type: 'FeatureCollection', features: [cafe] }, meta: {} }, 100);
  assert.equal(out.length, 1);
  assert.equal((out[0]!.feature as { id: string }).id, 'way/1');
}

{
  const park = {
    type: 'Feature',
    id: 'way/1',
    geometry: { type: 'Polygon', coordinates: [[[18.07, 59.33], [18.08, 59.33], [18.08, 59.34], [18.07, 59.33]]] },
    properties: { centroid: { coordinates: [18.07, 59.33] } },
  };
  const out = nearest_within([park], [point('node/2', 18.0702, 59.33)], 100);
  assert.equal(out.length, 1);
}

{
  const bad = {
    type: 'Feature',
    id: 'node/bad',
    geometry: { type: 'Point', coordinates: [null, null] },
    properties: {},
  };
  assert.throws(
    () => nearest_within([bad], [point('node/1', 18.07, 59.33)], 100),
    { message: /centroid/ },
  );
}

{
  const nanPt = {
    type: 'Feature',
    id: 'node/nan',
    geometry: { type: 'Point', coordinates: [Number.NaN, 59.33] },
    properties: {},
  };
  assert.throws(
    () => nearest_within([point('node/1', 18.07, 59.33)], [nanPt], 100),
    { message: /centroid/ },
  );
}

{
  const poly = {
    type: 'Feature',
    id: 'way/1',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    properties: {},
  };
  assert.throws(
    () => nearest_within([poly], [point('node/1', 0, 0)], 100),
    { message: /centroid/ },
  );
}

console.log('nearest_within checks passed');
