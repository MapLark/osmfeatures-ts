import { OSMFeatures } from 'osmfeatures';

const client = new OSMFeatures(process.env.MAPLARK_API_KEY!, {
  apiBaseUrl: process.env.MAPLARK_BASE_URL,
});
const nearby = await client.places_nearby({
  location: { lat: 59.316, lng: 18.075 },
  orTags: ['amenity=pharmacy'],
  radius: 1000,
  limit: 5,
});
console.log(nearby);
