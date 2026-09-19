import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const lock = JSON.parse(await readFile(new URL('../site/package-lock.json', import.meta.url), 'utf8'));
const release = lock.packages['node_modules/air-cursor'];
if (!release?.resolved?.startsWith('https://registry.npmjs.org/air-cursor/') || !release.integrity) {
  throw new Error('The production demo must use an integrity-pinned npm release. Run npm ci --prefix site.');
}
const result = await build({ entryPoints: ['site/core-entry.js'], bundle: true, format: 'esm', minify: true, target: 'es2020', outfile: 'docs/assets/aircursor-core.js', metafile: true });
const inputs = Object.keys(result.metafile.inputs).map(path => path.replaceAll('\\', '/'));
if (!inputs.includes('site/node_modules/air-cursor/dist/esm/core/engine.js') || inputs.some(path => path.startsWith('src/'))) {
  throw new Error('The demo bundle did not resolve exclusively to the published package.');
}
await writeFile('docs/assets/demo-package.json', JSON.stringify({ name: 'air-cursor', version: release.version, tarball: release.resolved, integrity: release.integrity }, null, 2) + '\n');
console.log(`Production demo: verified air-cursor@${release.version} from npm.`);
