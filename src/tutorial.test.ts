import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

if (!process.env['MAPLARK_API_KEY']) {
  console.log('tutorial.test.ts: skipped (MAPLARK_API_KEY not set)');
  process.exit(0);
}

// Tutorials import 'osmfeatures' (copy-paste for the site). That name resolves to
// local dist/index.js, not npm. Rebuild after SDK source changes or these tests stay stale.
await import('./tutorial/places_search.js');
await import('./tutorial/places_nearby.js');
await import('./tutorial/osm_features_query.js');
console.log('tutorial.test.ts: ok');
