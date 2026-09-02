import { OSMFeatures } from 'osmfeatures';

const client = new OSMFeatures(process.env.MAPLARK_API_KEY!, {
  apiBaseUrl: process.env.MAPLARK_BASE_URL,
});
const buildings = await client.query({
  bbox: '18.06,59.32,18.09,59.34',
  tags: ['building'],
});
console.log(buildings);
