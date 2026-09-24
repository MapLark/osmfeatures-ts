# TypeScript OSM Features client

npm package for the [MapLark OSM Features API](https://maplark.com). Fetch OpenStreetMap buildings, roads, parks, and POIs as GeoJSON, FlatGeobuf, GeoParquet, or CSV from Node.js or the browser without standing up Overpass or converting extracts by hand. Simply search by tag and bounding box or location + radius. The API keeps OSM semantics intact, like node, way, relation, and returns GeoJSON Features you can feed straight into Leaflet, MapLibre, OpenLayers, or any geospatial toolchain. Use this lib to build geospatial apps on OSM easily without hitting rate limits or setting up complex and expensive infrastructure yourself.

The backend is dedicated PostGIS, not the public Overpass endpoint, with API keys and rate limits so map tiles and POI queries stay fast under load. This SDK also covers local-search and mobility: amenity lookup, OSM opening hours, and walk or bicycle routing.

## Contents

- [Quick start](#quick-start)
- [Functions and Parameters](#functions-and-parameters)
  - [query()](#query)
  - [Query a large bbox](#query-a-large-bbox)
  - [count](#count)
  - [usage](#usage)
- [Places and routes](#places-and-routes)
  - [Places search](#places-search)
  - [Nearby](#nearby-ranked-from-a-point)
  - [Place details](#place-details)
  - [Opening hours](#opening-hours)
  - [X near Y](#x-near-y-local-join)
  - [Walk and bike routes](#walk-and-bike-routes)
- [MCP server](#mcp-server)

OSM types map to GeoJSON the way GIS tools expect:

- `node` → Point
- `way` → LineString or Polygon
- `relation` → MultiPolygon or a bundle of geometries

Filters use ordinary OSM tags (`amenity=cafe`, `building=yes`). If you already write Overpass or edit OSM, the same keys work here. Drop a FeatureCollection into Leaflet, MapLibre, OpenLayers, or Turf.

Use `way_shape` when you need lines vs areas:

- `way_shape=line` — unclosed ways (streets, footpaths, rivers) and line-like relations (routes, some boundaries)
- `way_shape=polygon` — closed ways (building footprints, parks) and multipolygon relations
- `way_shape=all` — both (the default if you leave it off)

Buildings in a box: `type=way & tags=building` — the same idea as Overpass `way[building]`.

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

// Binary / table encodings via Accept param
const fgb = await client.query({
  bbox: '18.06,59.32,18.09,59.34',
  tags: ['building'],
  accept: 'application/flatgeobuf',
});
console.log(fgb.data);
```

Talks to `https://api.maplark.com` by default.

# Functions and Parameters



## `query()`

`query()` calls `GET /v3/osm_features` and returns the whole tile. Returns `{ data, meta }` where `data` is a GeoJSON FeatureCollection (default) or an `ArrayBuffer` for binary encodings.

Omit `limit` for the API default. Paid keys may raise `limit` up to their `max_limit` (enterprise 1000000). A larger match set is truncated (`X-Has-More: true`). Pass `splitUntilFit: true` to quarter the bbox until each piece fits. That adds latency. Pass `bboxTiles: 2` (or 4, 8, ...) to split the bbox up front. `query` does not take `cursor`.

#### Spatial anchors (required)

The geographical area for the request in terms of GPS coordinates or specific OSM ids.


| Param    | Type     | Description                                        |
| -------- | -------- | -------------------------------------------------- |
| `bbox`   | `string` | Bounding box as `min_lon,min_lat,max_lon,max_lat`. |
| `location` | `string` | Point for a radius search as `lat,lng`. Requires `radius`. |
| `radius` | `number` | Search radius in metres. Requires `location`. |
| `within` | `string` | Polygon spatial anchor as `way/<id>` or `relation/<id>`. Mutually exclusive with `bbox` / `location`. |
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

Output format, tiling, and budget. 


| Param                  | Type      | Default                | Description                                                                                                                                                               |
| ---------------------- | --------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accept`               | `string`  | `application/geo+json` | Response media type in header. Options - `application/geo+json`, `text/csv`, `text/tab-separated-values`, `application/flatgeobuf`, and `application/vnd.apache.parquet`. |
| `bboxTiles`            | `number`        | `1`                    | Split `bbox` into this many tiles (must be a power of 2: `1`, `2`, `4`, `8`, …). Use when a bbox exceeds your tier area cap.                                              |
| `splitUntilFit`        | `boolean`       | `false`                | On a truncated tile, count matches and quarter the bbox until each piece fits. Adds latency.                                                                           |
| `maxFeatures`          | `number | null` | `1000000`              | Cap on merged features after dedupe. Pass `null` for no cap.                                                                                                              |
| `timeout`              | `number | null` | `60`                   | Wall-clock seconds for this call. Pass `null` for no cap.                                                                                                                 |
| `zoom`                 | `number`  |                        | Map zoom hint (used by presets / server-side simplification policies).                                                                                                    |




### Meta

| Field           | Description                                    |
| --------------- | ---------------------------------------------- |
| `returned`      | Features in the merged result.                 |
| `has_more`      | `true` if the client trimmed to `maxFeatures`. |
| `units_charged` | Usage for a single-request call when present.  |



## Query a large bbox
Use this to query a larger bbox than what is allowed by splitting the bbox up into multiple tiles and requests.
```ts
const allRestaurants = await client.query({
  bbox: '18.063,59.322,18.082,59.332',
  tags: ['amenity=restaurant'],
  splitUntilFit: true,
  maxFeatures: 1_000_000,
  timeout: 60,
});
```

`query_all()` is the same as `query()`.


Also exports layer presets (`resolveLayerFromQuery`, `OSM_FEATURES_LAYER_PRESETS`, ...),
GeoJSON payload helpers (`featureCentroid`, `geometryBounds`, `parseFeatureId`, ...),
and local helpers (`nearest_within`, `point_in_geometry`, `isOpenNow`).

## `count`

Count features grouped by a tag key via `GET /v2/osm_features/count`. Returns `{ groups, total, truncated }`. Spatial windows are larger than `query` (country-scale on every tier) and billed count-only. `limit` is max histogram buckets (API default 100), not a scan cap. `groupBy` is required. Same tag filters as `query`; no `osmIds`, `zoom`, `centroid`, or `clipGeometry`. Map Express/query strings with `resolveCountRequest` (requires `group_by`).

```ts
const histogram = await client.count({
  groupBy: 'amenity',
  bbox: '18.05,59.32,18.10,59.34',
  type: 'node',
  tags: ['amenity'],
});
console.log(histogram.total, histogram.groups);
```

City boundary:

```ts
const mix = await client.count({
  groupBy: 'amenity',
  within: 'relation/398021',
  tags: ['amenity'],
});
```

## `usage`

This month's unit-budget usage via `GET /v1/usage`.

```ts
const usage = await client.usage();
console.log(usage.tier, usage.usage_this_month, usage.remaining_this_month);
```

## Places and routes

`query()` is the raw OSM layer: footprints, highways, park polygons, any tag and geometry class. Places and routes sit on the same planet extract but answer product questions: amenities in a box, ranked POIs from a pin, opening hours, walk/bike isochrones, and multi-stop paths. You supply tags, extent, time, and `WALK` or `BICYCLE`. The API returns coordinates, `openNow`, distances, and network geometry.

Unset fields are omitted so server defaults apply (`places_search` limit 100, `places_nearby` radius 1000 m and limit 100, `loop` true). HTTP docs: [maplark.com/developer](https://maplark.com/developer).

### Places search

`places_search()` looks up POIs inside a bounding box **or** around `{ lat, lon }` + `radius` (pick one). `tags` is AND; `orTags` is OR; both use the same OSM keys as `query()`. Leave `limit` off for the API default (100, max 10_000).

```ts
const origin = { lat: 59.316, lon: 18.075 };

const cafes = await client.places_search({
  location: origin,
  radius: 800,
  orTags: ['amenity=cafe'],
  openNow: true,
  asOf: '2026-08-10T18:00:00+02:00',
});
```

### Nearby (ranked from a point)

`places_nearby()` is “what is closest to this coordinate?”. You must pass `tags` or `orTags`. Hits are ordered by straight-line spheroid distance. Defaults if omitted: 1000 m radius, 100 results.

```ts
const nearby = await client.places_nearby({
  location: origin,
  orTags: ['amenity=cafe'],
  limit: 5,
  openNow: true,
  asOf: '2026-08-10T18:00:00+02:00',
});
```

### Place details

`places_details()` reloads a single OSM place by the id search or nearby gave you (`node/123`), or as `{ osmType, osmId }`.

```ts
const first = (cafes.features as { id: string }[])[0];
const details = await client.places_details({ osmType: first.id });
// same as: client.places_details({ osmType: 'node', osmId: 123 })
```

Hours are evaluated at request time in that place’s timezone.

### Opening hours

When OSM `opening_hours` can be parsed, the feature gets `properties.openNow` as `true` or `false`. Missing or junk hours omit the field. `isOpenNow(feature)` keeps known-open places and unwraps the details `{ feature }` envelope.

Timezone is inferred from coordinates (IANA). There is no `timezone` request field.

- `openNow: true` drops closed and unknown-hours POIs (Google Places–style `openNow`).
- `asOf` is the evaluation instant (default: now). An offset (`Z`, `+02:00`) is an absolute instant. A naive `2026-08-10T20:00:00` is local clock at the search point or bbox centre.
- `asOf` or `openNow` also require an `opening_hours` tag, so untagged amenities do not pad the page.
- Places that are closed but tagged still appear unless `openNow` is set.

### "X near Y" (local join)

`places_nearby` ranks against one origin. “Restaurants within 150 m of a station” is two searches plus an in-process join. `nearest_within` does not hit the API.

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

Each pair is `{ feature, distance_m, nearest }`. The point is `geometry` when it is a Point, otherwise `properties.centroid` (same as `featureCentroid`). Neither present throws. Empty secondary → `[]`. Distances are spherical haversine (mean Earth radius 6371000 m). `limit` keeps the closest pairs (default 20); `{ limit: null }` returns every primary with a match. More than 500000 comparisons throws — lower `places_search` / `places_nearby` `limit`, do not dump a large `query()` result. `{ data, meta }` from `query()` is accepted.

### Walk and bike routes

Paths follow OSM walk and bicycle ways. Default `travelMode` is `WALK`; pass `'BICYCLE'` for bikes. Driving is not offered yet.

Coordinates take `lon` or `lng`. For `routes_isochrone`, set exactly one of `maxDistanceM` or `durationS`. `searchBufferM` widens the highway fetch if the default corridor cannot form a path.

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

In-process (no HTTP): `nearest_within(primary, secondary, maxDistanceM)` for proximity joins, `point_in_geometry(lon, lat, geom)` for isochrone containment. The latter accepts a Polygon/MultiPolygon, a Feature, a GeometryCollection, or `{ geometry }` from the isochrone response.


## MCP server

Maplark has an MCP server to integrate OpenStreetMap data into AI and LLMs such as Claude, Cursor, and Copilot. However, it is implemented in another Python sister repo. See [maplark.com/products/mcp-server](https://maplark.com/products/mcp-server) for more details.

