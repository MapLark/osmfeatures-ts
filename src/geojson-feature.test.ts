import assert from 'node:assert/strict';
import {
  featureCentroid,
  geometryBounds,
  geometryGroup,
  parseFeatureId,
  readTags,
} from './geojson-feature.js';

assert.equal(geometryGroup('MultiPolygon'), 'polygons');
assert.equal(geometryGroup('LineString'), 'lines');
assert.equal(geometryGroup('Point'), 'points');
assert.equal(geometryGroup('GeometryCollection'), null);

assert.deepEqual(parseFeatureId('relation/99'), { type: 'relation', osmId: '99' });
assert.deepEqual(parseFeatureId('way/42'), { type: 'way', osmId: '42' });

assert.deepEqual(readTags({ tags: { a: '1' } }), { a: '1' });
assert.deepEqual(readTags({ tags: '{"a":"1"}' }), { a: '1' });
assert.deepEqual(readTags({}), {});

assert.deepEqual(
  featureCentroid({
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    properties: { centroid: { type: 'Point', coordinates: [0.5, 0.5] } },
  }),
  [0.5, 0.5],
);
assert.deepEqual(
  featureCentroid({ geometry: { type: 'Point', coordinates: [18.06, 59.33] } }),
  [18.06, 59.33],
);
assert.equal(
  featureCentroid({ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }),
  null,
);

const line = { type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0]] };
assert.deepEqual(geometryBounds(line), [[0, 0], [2, 0]]);
assert.equal(geometryBounds(null), null);

console.log('geojson-feature.test.ts: ok');
