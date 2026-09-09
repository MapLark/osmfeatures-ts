import assert from 'node:assert/strict';
import { point_in_geometry } from './geometry.js';

const SQUARE = {
  type: 'Polygon',
  coordinates: [[[18.07, 59.31], [18.09, 59.31], [18.09, 59.33], [18.07, 59.33], [18.07, 59.31]]],
};

const SQUARE_WITH_HOLE = {
  type: 'Polygon',
  coordinates: [
    SQUARE.coordinates[0],
    [[18.075, 59.315], [18.085, 59.315], [18.085, 59.325], [18.075, 59.325], [18.075, 59.315]],
  ],
};

const WEST_SQUARE = {
  type: 'Polygon',
  coordinates: [[[18.00, 59.31], [18.02, 59.31], [18.02, 59.33], [18.00, 59.33], [18.00, 59.31]]],
};

assert.equal(point_in_geometry(18.08, 59.32, SQUARE), true);
assert.equal(point_in_geometry(18.05, 59.32, SQUARE), false);
assert.equal(point_in_geometry(18.08, 59.32, { type: 'LineString', coordinates: [] }), false);

assert.equal(point_in_geometry(18.08, 59.32, SQUARE_WITH_HOLE), false);
assert.equal(point_in_geometry(18.072, 59.312, SQUARE_WITH_HOLE), true);

const multi = { type: 'MultiPolygon', coordinates: [WEST_SQUARE.coordinates, SQUARE.coordinates] };
assert.equal(point_in_geometry(18.01, 59.32, multi), true);
assert.equal(point_in_geometry(18.08, 59.32, multi), true);
assert.equal(point_in_geometry(18.05, 59.32, multi), false);

const holedMulti = { type: 'MultiPolygon', coordinates: [SQUARE_WITH_HOLE.coordinates] };
assert.equal(point_in_geometry(18.08, 59.32, holedMulti), false);

assert.equal(point_in_geometry(18.08, 59.32, { type: 'Feature', geometry: SQUARE }), true);
assert.equal(point_in_geometry(18.05, 59.32, { type: 'Feature', geometry: SQUARE }), false);
assert.equal(point_in_geometry(18.08, 59.32, { status: 'ok', geometry: SQUARE }), true);
assert.equal(point_in_geometry(18.05, 59.32, { status: 'ok', geometry: SQUARE }), false);

const collection = { type: 'GeometryCollection', geometries: [WEST_SQUARE, SQUARE] };
assert.equal(point_in_geometry(18.01, 59.32, collection), true);
assert.equal(point_in_geometry(18.08, 59.32, collection), true);
assert.equal(point_in_geometry(18.05, 59.32, collection), false);

assert.equal(point_in_geometry(18.08, 59.32, null), false);
assert.equal(point_in_geometry(18.08, 59.32, { type: 'Feature', geometry: null }), false);
// Even-odd: the east edge uses a strict `lon < xAtLat` test, so it is outside.
assert.equal(point_in_geometry(18.09, 59.32, SQUARE), false);

console.log('point_in_geometry checks passed');
