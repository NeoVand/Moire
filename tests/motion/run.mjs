// Store modules use Vite's extensionless TypeScript imports. Bundle the tests to
// a temporary directory so they exercise the real modules without a browser.
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = await mkdtemp(join(tmpdir(), 'moire-motion-'));
try {
  for (const name of ['types/motion', 'types/composition', 'store/paramMetadata', 'store/transport', 'store/history']) {
    const outfile = join(out, `${name.replaceAll('/', '-')}.mjs`);
    await build({ entryPoints: [join(root, `src/${name}.test.ts`)], outfile, bundle: true, platform: 'node', format: 'esm' });
    await import(pathToFileURL(outfile).href);
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
await import('./library.test.mjs');
