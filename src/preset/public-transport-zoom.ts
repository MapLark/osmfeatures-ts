import type { OSMFeaturesLayerPreset } from './catalog.js';

// public_transport detail floors (omit zoom = full detail, same as z >= FULL):
//   z >= 14     — full catalog (stops, platforms, bus routes, …)
//   12 <= z < 14 — rail network + urban rail + major stops (no bus-stop clutter)
//   z < 12      — mainline rail + stations only
// Roughly matches OpenMapTiles railway class floors (rail early; subway/tram/stops later).
export const PUBLIC_TRANSPORT_FULL_DETAIL_ZOOM = 13.8;
const PUBLIC_TRANSPORT_MAJOR_ZOOM = 11.8;

const PUBLIC_TRANSPORT_MAJOR_OR_TAGS = [
  'railway=rail',
  'railway=station',
  'route=train',
];

const PUBLIC_TRANSPORT_MID_OR_TAGS = [
  ...PUBLIC_TRANSPORT_MAJOR_OR_TAGS,
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

/** Opt-in: drop stop/platform clutter on public_transport as map zooms out. Omit zoom for full detail. */
export function applyPublicTransportZoomPolicy<T extends OSMFeaturesLayerPreset>(
  preset: T,
  zoom?: number,
): T {
  if (preset.id !== 'public_transport' || zoom == null || zoom >= PUBLIC_TRANSPORT_FULL_DETAIL_ZOOM) {
    return preset;
  }

  const orTags =
    zoom < PUBLIC_TRANSPORT_MAJOR_ZOOM
      ? PUBLIC_TRANSPORT_MAJOR_OR_TAGS
      : PUBLIC_TRANSPORT_MID_OR_TAGS;

  return {
    ...preset,
    tags: undefined,
    orTags: [...orTags],
    notTags: preset.notTags,
  };
}
