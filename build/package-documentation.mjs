import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const catalog = JSON.parse(await readFile(resolve(root, 'docs/documentation-catalog.json'), 'utf8'));
const config = JSON.parse(await readFile(resolve(root, 'dist/server/wrangler.json'), 'utf8'));
if (!config.assets?.run_worker_first?.includes('/api/owner-documents/*')) {
  throw new Error('Documentation requires Worker-first authorization before asset delivery.');
}
const destination = resolve(root, 'dist/client/api/owner-documents');
await mkdir(destination, { recursive: true });
for (const document of catalog) {
  await copyFile(resolve(root, document.source), resolve(destination, document.id));
}
console.log(`Packaged ${catalog.length} current documentation downloads.`);
