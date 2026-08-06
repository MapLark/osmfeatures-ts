import assert from 'node:assert/strict';
import {
  OSM_FEATURES_LAYER_PRESETS,
  applyPublicTransportZoomPolicy,
  applyRoadsPathsZoomPolicy,
  applyWaterwaysZoomPolicy,
  getPreset,
  resolveBuildingsMinAreaM2,
  resolveCustomLayerFromQuery,
  resolveLayerFromQuery,
  resolvePresetFromQuery,
} from './index.js';

type AppError = Error & {
  status?: number;
  code?: string;
};

const STOCKHOLM_BBOX = '18.02,59.305,18.115,59.355';

const majorOrTags = [
  'highway=motorway',
  'highway=motorway_link',
  'highway=trunk',
  'highway=trunk_link',
  'highway=primary',
  'highway=primary_link',
];
const midOrTags = [
  ...majorOrTags,
  'highway=secondary',
  'highway=secondary_link',
  'highway=tertiary',
  'highway=tertiary_link',
  'highway=unclassified',
  'highway=residential',
  'highway=living_street',
];

const waterwaysFullOrTags = [
  'waterway=river',
  'waterway=canal',
  'waterway=stream',
  'waterway=drain',
  'waterway=ditch',
];
const waterwaysRiverOrTags = ['waterway=river'];
const waterwaysRiverCanalOrTags = ['waterway=river', 'waterway=canal'];

const publicTransportMajorOrTags = [
  'railway=rail',
  'railway=station',
  'route=train',
];
const publicTransportMidOrTags = [
  ...publicTransportMajorOrTags,
  'railway=narrow_gauge',
  'railway=light_rail',
  'railway=subway',
  'railway=tram',
  'railway=halt',
  'amenity=bus_station',
  'route=subway',
  'route=light_rail',
  'route=tram',
];

function assertAppError(error: unknown, expected: { status: number; code: string; message: RegExp }): void {
  const appError = error as AppError;
  assert.equal(appError.status, expected.status);
  assert.equal(appError.code, expected.code);
  assert.match(appError.message, expected.message);
}

async function main(): Promise<void> {
  assert.equal(getPreset('buildings')?.id, 'buildings');
  assert.equal(getPreset('waterways')?.id, 'waterways');
  assert.equal(getPreset('nope'), undefined);

  await assert.rejects(
    async () => resolvePresetFromQuery({}),
    (error: unknown) => {
      assertAppError(error, { status: 400, code: 'invalid_preset', message: /preset is required/ });
      return true;
    },
  );

  await assert.rejects(
    async () => resolvePresetFromQuery({ preset: 'unknown', bbox: STOCKHOLM_BBOX }),
    (error: unknown) => {
      assertAppError(error, { status: 400, code: 'invalid_preset', message: /Unknown preset: unknown/ });
      return true;
    },
  );

  await assert.rejects(
    async () => resolvePresetFromQuery({ preset: 'buildings' }),
    (error: unknown) => {
      assertAppError(error, { status: 400, code: 'invalid_bbox', message: /bbox is required/ });
      return true;
    },
  );

  assert.equal(
    resolvePresetFromQuery({ preset: 'buildings', bbox: '18.1,59.4,18.0,59.3' }).bbox,
    '18.1,59.4,18.0,59.3',
  );

  // No zoom → full catalog detail for every preset (plus required bbox).
  for (const id of Object.keys(OSM_FEATURES_LAYER_PRESETS) as Array<keyof typeof OSM_FEATURES_LAYER_PRESETS>) {
    assert.deepEqual(
      resolvePresetFromQuery({ preset: id, bbox: STOCKHOLM_BBOX }),
      { ...OSM_FEATURES_LAYER_PRESETS[id], bbox: STOCKHOLM_BBOX },
    );
  }
  assert.deepEqual(
    applyRoadsPathsZoomPolicy(OSM_FEATURES_LAYER_PRESETS.roads_paths, undefined),
    OSM_FEATURES_LAYER_PRESETS.roads_paths,
  );

  const major = applyRoadsPathsZoomPolicy(OSM_FEATURES_LAYER_PRESETS.roads_paths, 10.9);
  assert.equal(major.tags, undefined);
  assert.deepEqual(major.orTags, majorOrTags);
  assert.equal(major.notTags, undefined);

  const mid = applyRoadsPathsZoomPolicy(OSM_FEATURES_LAYER_PRESETS.roads_paths, 12.4);
  assert.equal(mid.tags, undefined);
  assert.deepEqual(mid.orTags, midOrTags);
  assert.equal(mid.notTags, undefined);

  const full = applyRoadsPathsZoomPolicy(OSM_FEATURES_LAYER_PRESETS.roads_paths, 13.5);
  assert.equal(full.notTags, undefined);
  assert.deepEqual(full.tags, ['highway']);

  const resolvedMajor = resolvePresetFromQuery({
    preset: 'roads_paths',
    bbox: STOCKHOLM_BBOX,
    zoom: '10',
  });
  assert.deepEqual(resolvedMajor.orTags, majorOrTags);
  assert.equal(resolvedMajor.tags, undefined);
  assert.equal(resolvedMajor.bbox, STOCKHOLM_BBOX);

  assert.deepEqual(
    applyWaterwaysZoomPolicy(OSM_FEATURES_LAYER_PRESETS.waterways, undefined),
    OSM_FEATURES_LAYER_PRESETS.waterways,
  );

  const waterRiver = applyWaterwaysZoomPolicy(OSM_FEATURES_LAYER_PRESETS.waterways, 11);
  assert.deepEqual(waterRiver.orTags, waterwaysRiverOrTags);

  const waterCanal = applyWaterwaysZoomPolicy(OSM_FEATURES_LAYER_PRESETS.waterways, 12);
  assert.deepEqual(waterCanal.orTags, waterwaysRiverCanalOrTags);

  const waterFull = applyWaterwaysZoomPolicy(OSM_FEATURES_LAYER_PRESETS.waterways, 13);
  assert.deepEqual(waterFull.orTags, waterwaysFullOrTags);

  const resolvedWater = resolvePresetFromQuery({
    preset: 'waterways',
    bbox: STOCKHOLM_BBOX,
    zoom: '11',
  });
  assert.deepEqual(resolvedWater.orTags, waterwaysRiverOrTags);
  assert.equal(resolvedWater.shape, 'line');

  assert.deepEqual(
    applyPublicTransportZoomPolicy(OSM_FEATURES_LAYER_PRESETS.public_transport, undefined),
    OSM_FEATURES_LAYER_PRESETS.public_transport,
  );

  const transitMajor = applyPublicTransportZoomPolicy(
    OSM_FEATURES_LAYER_PRESETS.public_transport,
    11,
  );
  assert.deepEqual(transitMajor.orTags, publicTransportMajorOrTags);

  const transitMid = applyPublicTransportZoomPolicy(
    OSM_FEATURES_LAYER_PRESETS.public_transport,
    12,
  );
  assert.deepEqual(transitMid.orTags, publicTransportMidOrTags);

  const transitFull = applyPublicTransportZoomPolicy(
    OSM_FEATURES_LAYER_PRESETS.public_transport,
    14,
  );
  assert.deepEqual(transitFull.orTags, OSM_FEATURES_LAYER_PRESETS.public_transport.orTags);

  const resolvedTransit = resolvePresetFromQuery({
    preset: 'public_transport',
    bbox: STOCKHOLM_BBOX,
    zoom: '11',
  });
  assert.deepEqual(resolvedTransit.orTags, publicTransportMajorOrTags);

  const speck = resolveBuildingsMinAreaM2('buildings', STOCKHOLM_BBOX, 11.5);
  assert.equal(typeof speck, 'number');
  assert.ok(speck! > 20 && speck! < 400);

  const small = resolveBuildingsMinAreaM2('buildings', STOCKHOLM_BBOX, 10);
  assert.equal(typeof small, 'number');
  assert.ok(small! > 1_000 && small! < 20_000);
  assert.ok(small! > speck!);

  assert.equal(resolveBuildingsMinAreaM2('buildings', STOCKHOLM_BBOX, 12.5), undefined);
  assert.equal(resolveBuildingsMinAreaM2('roads_paths', STOCKHOLM_BBOX, 10), undefined);

  assert.deepEqual(
    resolveCustomLayerFromQuery({
      bbox: STOCKHOLM_BBOX,
      tags: ['amenity=cafe'],
      or_tags: ['amenity=restaurant', 'amenity=bar'],
      not_tags: 'access=private',
    }),
    {
      bbox: STOCKHOLM_BBOX,
      tags: ['amenity=cafe'],
      orTags: ['amenity=restaurant', 'amenity=bar'],
      notTags: ['access=private'],
    },
  );

  await assert.rejects(
    async () => resolveCustomLayerFromQuery({ bbox: STOCKHOLM_BBOX, not_tags: ['building'] }),
    (error: unknown) => {
      assertAppError(error, { status: 400, code: 'invalid_tags', message: /tags or or_tags is required/ });
      return true;
    },
  );

  const presetWins = resolveLayerFromQuery({
    preset: 'buildings',
    bbox: STOCKHOLM_BBOX,
    tags: ['ignored'],
  });
  assert.ok('id' in presetWins);
  assert.equal(presetWins.id, 'buildings');
  assert.deepEqual(
    resolveLayerFromQuery({ bbox: STOCKHOLM_BBOX, tags: ['shop'] }),
    { bbox: STOCKHOLM_BBOX, tags: ['shop'] },
  );
  assert.deepEqual(
    resolveCustomLayerFromQuery({
      bbox: STOCKHOLM_BBOX,
      tags: ['building'],
      type: 'way,relation',
      shape: 'polygon',
    }),
    {
      bbox: STOCKHOLM_BBOX,
      tags: ['building'],
      type: 'way,relation',
      shape: 'polygon',
    },
  );

  console.log('preset checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
