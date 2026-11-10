// Optional standalone deployment from a GitHub checkout. This script does not publish.
import { readFileSync, writeFileSync } from 'node:fs';
const name = process.env.CF_WORKER_NAME || 'energy-generator-landing';
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID || '';
if (!/^[a-z][a-z0-9-]{2,62}$/.test(name) || !/^[0-9a-f-]{36}$/i.test(databaseId)) {
  throw new Error('Set CF_WORKER_NAME and CLOUDFLARE_D1_DATABASE_ID before preparing standalone Cloudflare deployment.');
}
const path = new URL('../dist/server/wrangler.json', import.meta.url);
const config = JSON.parse(readFileSync(path, 'utf8'));
config.name = name; config.topLevelName = name;
config.d1_databases = [{binding:'DB',database_name:'energy-leads',database_id:databaseId,migrations_dir:'../../drizzle'}];
writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log('Prepared standalone Cloudflare config. Nothing was deployed.');
