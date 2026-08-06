# MapLark OSM Features API client

Official TypeScript/JavaScript client for the [MapLark OSM Features API](https://maplark.com) (GeoJSON, FlatGeobuf, GeoParquet, CSV). 

Query OpenStreetMap features such as buildings, streets, and POIs easily. Search for OSM features by bounding box, tags, and geometry shape and get GeoJSON back within less than 250ms (dependent on query size). No converting between formats manually. The API keeps OpenStreetMap semantics intact, like tags and ways, and returns GeoJSON Features you can feed straight into Leaflet, MapLibre, OpenLayers, or any geospatial toolchain. It is backed by postgis with tiered API keys and rate limiting to keep noisy neighbours out to give you predictable latency for real traffic. It also has self-host path for those willing to host complex infrastructure themselves.

The translation layer is very simple:

- `node` - GIS Point
- `way` - LineString or Polygon
- `relation` - MultiPolygon or grouped geometries

You filter with the same tags mappers already use (`amenity=cafe`, `building=yes`, and so on). Knowledge from OSM, Overpass, and tagging docs transfers immediately.

To narrow down between "open ways" and "closed ways", use the `shape` parameter:

- `shape=line` - open ways (roads, paths, rivers) or line-shaped relations (routes, boundaries)
- `shape=polygon` - closed ways (buildings, parks) or multipolygon relations.
- `shape=all` - both shapes (default when shape is omitted).

For example, to get all buildings in an area:

`type=way & tags=building`

This is the equivalent of the Overpass query `way[building]`.

Read the full API reference here [https://maplark.com/developer](https://maplark.com/developer).

# How to use it

```bash
# From npm (when published):
npm install osmfeatures

# Until then, from git:
npm install git+https://github.com/MapLark/osmfeatures-ts.git
```

```ts
import { OSMFeatures } from 'osmfeatures';

const client = new OSMFeatures('sk-...');
const page = await client.query({
  bbox: '18.06,59.32,18.09,59.34',
  tags: ['building'],
});

// Vanilla GeoJSON FeatureCollection (same shape as the HTTP body).
map.getSource('buildings').setData(page.data);
console.log(page.data.features.length);

// Header-derived meta (not part of GeoJSON): paging + usage.
console.log(page.meta.has_more, page.meta.next_cursor, page.meta.units_charged);

// Binary / table encodings via Accept — same { data, meta } shape.
const fgb = await client.query({
  bbox: '18.06,59.32,18.09,59.34',
  tags: ['building'],
  accept: 'application/flatgeobuf',
});
console.log(fgb.data instanceof ArrayBuffer, fgb.meta.has_more, fgb.meta.next_cursor);
```

Talks to `https://api.maplark.com` by default.

Also exports layer presets (`resolveLayerFromQuery`, `OSM_FEATURES_LAYER_PRESETS`, …)
and GeoJSON payload helpers (`featureCentroid`, `geometryBounds`, `parseFeatureId`, …).
