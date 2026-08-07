# OSM Features API client

Official client for the [MapLark OSM Features API](https://maplark.com) to get GeoJSON, FlatGeobuf, GeoParquet, or CSV from OpenStreetMap. The API gets data from dedicated postgis OSM servers separate from public Overpass.

Query OpenStreetMap features such as buildings, streets, and POIs easily. Search for OSM features by bounding box, tags, and geometry shape and get GeoJSON back within less than 250ms (dependent on query size). No converting between formats manually. The API keeps OSM semantics intact, like tags and ways, and returns OSM features you can feed straight into Leaflet, MapLibre, OpenLayers, or any geospatial toolchain. It is backed by postgis with tiered API keys and rate limiting to keep noisy neighbours out to give you low, predictable latency for real traffic. It also has self-host path for those willing to host complex infrastructure themselves.

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

# Quick start

```bash
npm install osmfeatures
```

```ts
import { OSMFeatures } from 'osmfeatures';

const client = new OSMFeatures('sk-...');
const page = await client.query({
  bbox: '18.06,59.32,18.09,59.34',
  tags: ['building'],
});

// Get GeoJSON FeatureCollection
console.log(page.data.features.length);

// Header meta for paging + usage
console.log(page.meta.has_more, page.meta.next_cursor, page.meta.units_charged);

// Binary / table encodings via Accept param
const fgb = await client.query({
  bbox: '18.06,59.32,18.09,59.34',
  tags: ['building'],
  accept: 'application/flatgeobuf',
});
console.log(fgb.data);
console.log(fgb.meta.has_more, fgb.meta.next_cursor);
```

Talks to `https://api.maplark.com` by default.

# Functions and Parameters

## `query()`

Fetches a single page from the API. Returns `{ data, meta }` where `data` is a GeoJSON FeatureCollection (default) or an `ArrayBuffer` for binary encodings.

#### Spatial anchors (required)
The geographical area for the request in terms of GPS coordinates or specific OSM ids.
| Param | Type | Description |
| --- | --- | --- |
| `bbox` | `string` | Bounding box as `min_lon,min_lat,max_lon,max_lat`. |
| `around` | `string` | Circle filter as `lon,lat,radius_m`. |
| `osmIds` | `string` | Comma-separated OSM IDs to fetch by id. |

#### Tags
The OSM tags to filter on, such as `building` or `amenity`.
| Param | Type | Description |
| --- | --- | --- |
| `tags` | `string[]` | Tag filters that must all match (AND). Values like `building` or `amenity=cafe`. |
| `orTags` | `string[]` | Tag filters where any may match (OR). |
| `notTags` | `string[]` | Tag filters to exclude. |

#### Geometry
Geometric filters such specific OSM element type, min length, or including centroid.

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `string` | all | OSM element types, e.g. `node`, `way`, `relation`, or comma-separated (`way,relation`). |
| `shape` | `line \| polygon \| all` | `all` | Geometry shape filter for ways and relations. |
| `centroid` | `boolean` | `false` | When `true`, include a centroid on non-point features. |
| `minLengthM` | `number` |  | Minimum length in metres (lines). |
| `maxLengthM` | `number` |  | Maximum length in metres (lines). |
| `minAreaM2` | `number` |  | Minimum area in square metres (polygons). |
| `maxAreaM2` | `number` |  | Maximum area in square metres (polygons). |

#### Other
Extra filters to for pagination, output format (accept), 

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `accept` | `string` | `application/geo+json` | Response media type. Options - `application/geo+json`, `text/csv`, `text/tab-separated-values`, `application/flatgeobuf`, and `application/vnd.apache.parquet`.
| `limit` | `number` | `1000` | Page size. Max `6000`. |
| `cursor` | `string` |  | Pagination cursor from a previous `meta.next_cursor`. |
| `disableBudgetWarning` | `boolean` | `false` | Ignore warnings for large queries that consume budget quotas. |
| `zoom` | `number` |  | Map zoom hint (used by presets / server-side simplification policies). |

### Meta
Fields for pagination and usage.

| Field | Description |
| --- | --- |
| `returned` | Features in this page. |
| `has_more` | Whether more pages exist. |
| `next_cursor` | Pass as `cursor` on the next `query` call, or `null` when done. |
| `units_charged` | Usage for this request when present in terms of cpu and ram consumed. |

## `query_all`

Auto-paginates (and optionally tiles the bbox) until the result is complete or a client-side cap is hit. GeoJSON only — for FlatGeobuf / other encodings, use `query` with `accept`.

Does not take `limit` or `cursor`; paging is handled internally.

```ts
const all = await client.query_all({
  bbox: '18.06,59.32,18.09,59.34',
  tags: ['building'],
  limitPerPage: 1000,
  bboxTiles: 2,
  maxPages: 15,
  maxFeatures: 55_000,
});

console.log(all.data.features.length);
console.log(all.meta.page_count, all.meta.has_more, all.meta.units_charged);
```

### Params

Same filter params as `query` (`bbox`, `tags`, `orTags`, `notTags`, `type`, `shape`, `zoom`, `around`, `osmIds`, `minLengthM`, `maxLengthM`, `minAreaM2`, `maxAreaM2`, `centroid`, `disableBudgetWarning`), plus:

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `limitPerPage` | `number` | `1000` | Upstream `limit` per HTTP request (page size). |
| `bboxTiles` | `number` | `2` | Split `bbox` into this many tiles (must be a power of 2: `1`, `2`, `4`, `8`, …). Each tile is paginated separately, then features are merged and deduped. |
| `maxPages` | `number` | `15` | Max pages fetched **per tile**. |
| `maxFeatures` | `number \| null` | `55000` | Cap on merged features after dedupe. Pass `null` for no cap. |
| `accept` | `string` | `application/geo+json` | Must be GeoJSON (or omitted). Non-GeoJSON throws. |

### Meta

Same fields as `query`, plus:

| Field | Description |
| --- | --- |
| `page_count` | Total upstream pages fetched. |
| `has_more` | `true` if stopped early (caps), or upstream still had more, or a partial relay stop. |
| `next_cursor` | Last cursor when incomplete; otherwise the final page cursor. |
| `units_charged` | Sum of units charged across pages when present. |
| `relay_partial` | `true` if paging stopped after a mid-stream 400/429 (partial result kept). |
| `relay_partial_reason` | e.g. `upstream_rejected_cursor` or `upstream_rate_limited_after_retries`. |

Also exports layer presets (`resolveLayerFromQuery`, `OSM_FEATURES_LAYER_PRESETS`, ...)
and GeoJSON payload helpers (`featureCentroid`, `geometryBounds`, `parseFeatureId`, ...).
