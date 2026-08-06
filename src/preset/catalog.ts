export type OSMFeaturesPresetId =
  | 'buildings'
  | 'roads_paths'
  | 'parks_green_space'
  | 'food_dining'
  | 'shops_commerce'
  | 'public_transport'
  | 'leisure_sports'
  | 'natural_features'
  | 'waterways';

/** Catalog entry: tags only. Pass bbox at resolve time. */
export type OSMFeaturesLayerPreset = {
  id: OSMFeaturesPresetId;
  label: string;
  tags?: string[];
  orTags?: string[];
  notTags?: string[];
  type?: string;
  shape?: 'line' | 'polygon';
};

export const OSM_FEATURES_LAYER_PRESETS: Record<OSMFeaturesPresetId, OSMFeaturesLayerPreset> = {
  buildings: {
    id: 'buildings',
    label: 'Buildings',
    tags: ['building'],
    type: 'way,relation',
    shape: 'polygon',
  },
  roads_paths: {
    id: 'roads_paths',
    label: 'Roads & paths',
    tags: ['highway'],
    type: 'way,relation',
    shape: 'line',
  },
  parks_green_space: {
    id: 'parks_green_space',
    label: 'Parks & green space',
    orTags: [
      'leisure=park',
      'leisure=garden',
      'landuse=grass',
      'landuse=forest',
      'natural=wood',
      'boundary=national_park',
    ],
    type: 'way,relation',
  },
  food_dining: {
    id: 'food_dining',
    label: 'Food & dining',
    orTags: [
      'amenity=restaurant',
      'amenity=cafe',
      'amenity=fast_food',
      'amenity=bar',
      'amenity=pub',
      'amenity=biergarten',
    ],
  },
  shops_commerce: {
    id: 'shops_commerce',
    label: 'Shops & commerce',
    orTags: [
      'shop',
      'amenity=marketplace',
      'amenity=fuel',
      'office',
    ],
  },
  public_transport: {
    id: 'public_transport',
    label: 'Public transport',
    orTags: [
      'highway=bus_stop',
      'railway=station',
      'railway=tram_stop',
      'railway=halt',
      'railway=subway_entrance',
      'railway=rail',
      'railway=subway',
      'railway=light_rail',
      'railway=tram',
      'railway=narrow_gauge',
      'public_transport=platform',
      'public_transport=stop_position',
      'amenity=bus_station',
      'route=train',
      'route=subway',
      'route=light_rail',
      'route=tram',
      'route=bus',
    ],
  },
  leisure_sports: {
    id: 'leisure_sports',
    label: 'Leisure & sports',
    orTags: [
      'leisure=pitch',
      'leisure=sports_centre',
      'leisure=stadium',
      'leisure=playground',
      'leisure=swimming_pool',
      'leisure=fitness_centre',
      'leisure=track',
    ],
  },
  natural_features: {
    id: 'natural_features',
    label: 'Natural features',
    orTags: [
      'natural=water',
      'natural=wood',
      'natural=scrub',
      'natural=wetland',
      'natural=peak',
      'natural=cliff',
      'natural=saddle',
      'natural=beach',
    ],
  },
  // OMT waterway classes: river / canal / stream / drain / ditch (no subclass).
  waterways: {
    id: 'waterways',
    label: 'Waterways',
    orTags: [
      'waterway=river',
      'waterway=canal',
      'waterway=stream',
      'waterway=drain',
      'waterway=ditch',
    ],
    type: 'way,relation',
    shape: 'line',
  },
};

export const OSM_FEATURES_LAYER_PRESET_ORDER: OSMFeaturesPresetId[] = [
  'buildings',
  'roads_paths',
  'parks_green_space',
  'food_dining',
  'shops_commerce',
  'public_transport',
  'leisure_sports',
  'natural_features',
  'waterways',
];
