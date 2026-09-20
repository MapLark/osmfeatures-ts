import { OSMFeatures } from 'osmfeatures';

const client = new OSMFeatures(process.env.MAPLARK_API_KEY!, {
  apiBaseUrl: process.env.MAPLARK_BASE_URL,
});
const histogram = await client.stats({
  groupBy: 'amenity',
  bbox: '18.05,59.32,18.10,59.34',
  type: 'node',
  tags: ['amenity'],
});
console.log(histogram.total, histogram.groups[0]);
