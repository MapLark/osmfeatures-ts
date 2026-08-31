import { OSMFeatures } from '../index.js';

const client = new OSMFeatures(process.env.MAPLARK_API_KEY!, {
  apiBaseUrl: process.env.MAPLARK_BASE_URL,
});
const cafes = await client.places_search({
  location: { lat: 59.316, lng: 18.075 },
  radius: 800,
  orTags: ['amenity=cafe'],
  openNow: true,
});
console.log(cafes);
