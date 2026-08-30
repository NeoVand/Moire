// Bundle main.ts (with three inlined) into a single self-contained HTML page.
// Usage: node build.mjs [outfile]
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, 'dist.html');

const result = await build({
  entryPoints: [join(here, 'main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  logLevel: 'silent',
});
const js = result.outputFiles[0].text;
const html = readFileSync(join(here, 'index.html'), 'utf8').replace(
  '/*__BUNDLE__*/',
  () => js
);
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
