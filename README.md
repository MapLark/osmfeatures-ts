# OSM Features API client

Official client for the [MapLark OSM Features API](https://maplark.com) to get GeoJSON, FlatGeobuf, GeoParquet, or CSV from OpenStreetMap. The API gets data from dedicated postgis OSM servers separate from public Overpass.

Query OpenStreetMap features such as buildings, streets, and POIs easily. Search for OSM features by bounding box, tags, and geometry shape and get GeoJSON back within less than 250ms (dependent on query size). No converting between formats manually. The API keeps OSM semantics intact, like tags and ways, and returns OSM features you can feed straight into Leaflet, MapLibre, OpenLayers, or any geospatial toolchain. It is backed by postgis with tiered API keys and rate limiting to keep noisy neighbours out to give you low, predictable latency for real traffic. It also has a self-host path for those willing to host complex infrastructure themselves, and Geo Agent methods for places search, opening hours, and walk or bike routing.

The translation layer is very simple:

- `node` - GIS Point
- `way` - LineString or Polygon
- `relation` - MultiPolygon or grouped geometries

You filter with the same tags mappers already use (`amenity=cafe`, `building=yes`, and so on). Knowledge from OSM, Overpass, and tagging docs transfers immediately.

To narrow down between "open ways" and "closed ways", use the `way_shape` parameter:

- `way_shape=line` - open ways (roads, paths, rivers) or line-shaped relations (routes, boundaries)
- `way_shape=polygon` - closed ways (buildings, parks) or multipolygon relations.
- `way_shape=all` - both shapes (default when way_shape is omitted).

For example, to get all buildings in an area:

`type=way & tags=building`

This is the equivalent of the Overpass query `way[building]`.

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


| Param    | Type     | Description                                        |
| -------- | -------- | -------------------------------------------------- |
| `bbox`   | `string` | Bounding box as `min_lon,min_lat,max_lon,max_lat`. |
| `location` | `string` | Point for a radius search as `lat,lng`. Requires `radius`. |
| `radius` | `number` | Search radius in metres. Requires `location`. |
| `osmIds` | `string` | Comma-separated OSM IDs to fetch by id.            |




#### Tags

The feature tags to filter on.


| Param     | Type       | Description                                                                      |
| --------- | ---------- | -------------------------------------------------------------------------------- |
| `tags`    | `string[]` | Tag filters that must all match (AND). Values like `building` or `amenity=cafe`. |
| `orTags`  | `string[]` | Tag filters where any may match (OR).                                            |
| `notTags` | `string[]` | Tag filters to exclude.                                                          |




#### Geometry

Geometric filters such specific OSM element type, min length, or including centroid.


| Param        | Type                   | Default | Description                                                                             |
| ------------ | ---------------------- | ------- | --------------------------------------------------------------------------------------- |
| `type`       | `string`               | all     | OSM element types, e.g. `node`, `way`, `relation`, or comma-separated (`way,relation`). |
| `wayShape`   | `line | polygon | all` | `all`   | Geometry class for ways and relations. `shape` is a deprecated alias.                   |
| `centroid`   | `boolean`              | `false` | When `true`, include a centroid on non-point features.                                  |
| `clipGeometry` | `boolean`            | `true`  | When `true`, clip returned geometry to the requested `bbox`. Set `false` for full geometry. |
| `minLengthM` | `number`               |         | Minimum length in metres (lines).                                                       |
| `maxLengthM` | `number`               |         | Maximum length in metres (lines).                                                       |
| `minAreaM2`  | `number`               |         | Minimum area in square metres (polygons).                                               |
| `maxAreaM2`  | `number`               |         | Maximum area in square metres (polygons).                                               |




#### Other

Extra filters to for pagination, output format (accept), 


| Param                  | Type      | Default                | Description                                                                                                                                                               |
| ---------------------- | --------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accept`               | `string`  | `application/geo+json` | Response media type in header. Options - `application/geo+json`, `text/csv`, `text/tab-separated-values`, `application/flatgeobuf`, and `application/vnd.apache.parquet`. |
| `limit`                | `number`  | API `1000`             | Page size. Omit to use the API default. Max `6000`.                                                                                                       |
| `cursor`               | `string`  |                        | Pagination cursor from a previous `meta.next_cursor`.                                                                                                                     |
| `disableBudgetWarning` | `boolean` | `false`                | Ignore warnings for large queries that consume budget quotas.                                                                                                             |
| `zoom`                 | `number`  |                        | Map zoom hint (used by presets / server-side simplification policies).                                                                                                    |




### Meta

Fields for pagination and usage.


| Field           | Description                                                           |
| --------------- | --------------------------------------------------------------------- |
| `returned`      | Features in this page.                                                |
| `has_more`      | Whether more pages exist.                                             |
| `next_cursor`   | Pass as `cursor` on the next `query` call, or `null` when done.       |
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

Same filter params as `query` (`bbox`, `tags`, `orTags`, `notTags`, `type`, `wayShape`, `zoom`, `location`, `radius`, `osmIds`, `minLengthM`, `maxLengthM`, `minAreaM2`, `maxAreaM2`, `centroid`, `clipGeometry`, `disableBudgetWarning`), plus:


| Param          | Type            | Default                | Description                                                                                                                                               |
| -------------- | --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limitPerPage` | `number`        | API `1000`             | Upstream `limit` per HTTP request (page size). Omit to use the API default.                                                                               |
| `bboxTiles`    | `number`        | `2`                    | Split `bbox` into this many tiles (must be a power of 2: `1`, `2`, `4`, `8`, …). Each tile is paginated separately, then features are merged and deduped. |
| `maxPages`     | `number`        | `15`                   | Max pages fetched **per tile**.                                                                                                                           |
| `maxFeatures`  | `number | null` | `55000`                | Cap on merged features after dedupe. Pass `null` for no cap.                                                                                              |
| `accept`       | `string`        | `application/geo+json` | Must be GeoJSON (or omitted). Non-GeoJSON throws.                                                                                                         |




### Meta

Same fields as `query`, plus:


| Field                  | Description                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `page_count`           | Total upstream pages fetched.                                                        |
| `has_more`             | `true` if stopped early (caps), or upstream still had more, or a partial relay stop. |
| `next_cursor`          | Last cursor when incomplete; otherwise the final page cursor.                        |
| `units_charged`        | Sum of units charged across pages when present.                                      |
| `relay_partial`        | `true` if paging stopped after a mid-stream 400/429 (partial result kept).           |
| `relay_partial_reason` | e.g. `upstream_rejected_cursor` or `upstream_rate_limited_after_retries`.            |


Also exports layer presets (`resolveLayerFromQuery`, `OSM_FEATURES_LAYER_PRESETS`, ...),
GeoJSON payload helpers (`featureCentroid`, `geometryBounds`, `parseFeatureId`, ...),
and local geo-agent helpers (`nearest_within`, `point_in_geometry`, `isOpenNow`).

## `estimate_cost`

Preflight credit cost via `GET /v2/osm_features/cost`. Same filter params as `query`. No OSM data is fetched.

```ts
const estimate = await client.estimate_cost({
  bbox: '18.06,59.32,18.09,59.34',
  tags: ['building'],
});
console.log(estimate.estimated_credits);
```

## `usage`

This month's unit-budget usage via `GET /v1/usage`.

```ts
const usage = await client.usage();
console.log(usage.tier, usage.usage_this_month, usage.remaining_this_month);
```

## Geo Agent (places and routes)

`query()` is the generic OpenStreetMap layer: buildings, roads, park polygons, any tag and geometry shape. Geo Agent is the place and mobility layer on top of the same OSM data. You pick OSM tags (`amenity=cafe`), an area, a time, and walk or bike. The API returns coordinates, opening-hours status, nearest-first ranks, and walk or bike geometry.

These endpoints answer questions like "cafes near me", "bars open at 20:00", or "suggest a walking bar crawl in Stockholm". An AI agent or a script can call the same methods.

| Endpoint | HTTP | What it does |
| -------- | ---- | ------------ |
| `places_search` | `POST /v1/places/search` | Find places in a bounding box **or** a `location` plus `radius`. Filter with OSM tags. Optional `openNow` / `asOf` for opening hours. |
| `places_nearby` | `POST /v1/places/nearby` | "X near this point". Same tags and hours filters, ranked nearest-first by straight-line distance. |
| `places_details` | `GET /v1/places/{osm_type}/{osm_id}` | Reload one place by the id search or nearby returned (`node/123`). |
| `routes_isochrone` | `POST /v1/routes/isochrone` | Walk or bike reach polygon from an origin (how far you can get in N metres or seconds). |
| `routes_path` | `POST /v1/routes/path` | Walk or bike through stops in the order you list them. No reordering. |
| `routes_optimized_path` | `POST /v1/routes/optimized_path` | Order the stops for you (a tour from `start`). `loop` (default true) returns to start. |

Search and nearby hours use each place's local timezone. Optional `asOf` pins the evaluation instant. Routing is walk or bicycle on the OSM network (`travelMode`: `WALK` or `BICYCLE`; API default `WALK`). Car routing is not available yet. The client omits unspecified fields so API defaults apply (`places_search` limit 100, `places_nearby` radius 1000 and limit 100, `loop` true).

#### Typical questions

| Prompt | SDK |
|------|-----|
| "Cafes near me" | `client.places_nearby()` or `client.places_search()` with `location` + `radius` |
| "Restaurants within 150 m of a station" | two `client.places_search()` calls, then `nearest_within` |
| "Bars open at 20:00" | `client.places_search()` with `asOf`, keep `isOpenNow(feature)` |
| "Cafes within a 10-minute bike ride" | `client.routes_isochrone()` + `client.places_search()` in a covering radius + `point_in_geometry` |
| "A walking bar crawl in Stockholm" | `client.places_search()` + `client.routes_optimized_path()` (`loop: true`) |
| "Walk from my hotel to the cafe, then the office" | `client.routes_path()` with those stops in listed order |
| "Suggest a walk to a bar, a restaurant, and a cafe, no particular order" | `client.routes_optimized_path()` with `loop: false` |
| "Is the office a 20-minute walk from the apartment?" | `client.routes_isochrone()` from A, `point_in_geometry` for B |

### Examples for `places_search` / `places_nearby` / `places_details`

```ts
const origin = { lat: 59.316, lon: 18.075 };

const cafes = await client.places_search({
  location: origin,
  radius: 800,
  orTags: ['amenity=cafe'],
  openNow: true,
  asOf: '2026-08-10T18:00:00+02:00',
});

const nearby = await client.places_nearby({
  location: origin,
  orTags: ['amenity=cafe'],
  limit: 5,
  openNow: true,
  asOf: '2026-08-10T18:00:00+02:00',
});

const first = (cafes.features as { id: string }[])[0];
const details = await client.places_details({ osmType: first.id });
```

`places_details` also accepts `{ osmType: 'node', osmId: 123 }`. Hours are annotated at request time in the place's local timezone. Known hours set `properties.openNow` to `true` or `false`; missing or unparseable hours omit the field. Use `isOpenNow(feature)` to keep known-open places (also unwraps the `{ feature }` details envelope).

### "X near Y" (local join)

`places_nearby` ranks against one point. "Restaurants within 150 m of a station" is two searches plus a local join. `nearest_within` does no HTTP.

```ts
import { nearest_within } from 'osmfeatures';

const bbox = '18.05,59.33,18.10,59.36';
const restaurants = await client.places_search({ bbox, orTags: ['amenity=restaurant'] });
const stations = await client.places_search({ bbox, orTags: ['railway=station'] });
const pairs = nearest_within(restaurants, stations, 150, { limit: 20 });

for (const pair of pairs) {
  console.log(pair.distance_m, pair.feature, 'near', pair.nearest);
}
```

Each pair is `{ feature, distance_m, nearest }`. The point comes from `geometry` when it is a Point, else `properties.centroid` (same rules as `featureCentroid`). A feature with neither throws. Empty secondary returns `[]`. Distances are spherical haversine (mean Earth radius 6371000 m). `limit` keeps the closest pairs (default 20); pass `{ limit: null }` for every primary that has a match. Joins over 500000 comparisons throw; shrink with `places_search` / `places_nearby` `limit`, not `query_all`. `query()` / `query_all()` results (`{ data, meta }`) are accepted.

### Examples for `routes_isochrone` / `routes_path` / `routes_optimized_path`

Points accept `lon` or `lng`. `routes_isochrone` takes exactly one of `maxDistanceM` or `durationS`. Optional `searchBufferM` widens the highway fetch corridor.

```ts
const origin = { lon: 18.075, lat: 59.316 };
const cafe = { lon: 18.08, lat: 59.318 };

const iso = await client.routes_isochrone({
  origin,
  durationS: 600,
});

const path = await client.routes_path({
  stops: [origin, cafe],
});

const tour = await client.routes_optimized_path({
  start: origin,
  stops: [cafe],
});

const office = { lon: 18.08, lat: 59.318 };
point_in_geometry(office.lon, office.lat, iso);
```

Local helpers (no HTTP): `nearest_within(primary, secondary, maxDistanceM)` for "X near Y", and `point_in_geometry(lon, lat, geom)` for isochrone containment. `point_in_geometry` accepts a Polygon/MultiPolygon, a Feature, a GeometryCollection, or the isochrone body (`{ geometry }`).

Read the full API reference here [https://maplark.com/developer](https://maplark.com/developer) such as the OpenAPI 2.0 HTTP docs.