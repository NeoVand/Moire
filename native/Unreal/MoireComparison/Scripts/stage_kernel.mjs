// Stage the author-owned generated kernel for Unreal's /Project shader mapping.
// Generated files are ignored; rerun before launching Unreal after a source edit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { OURS_KERNEL_HLSL } from '../../../../demo/ours-kernel.wgsl.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(project, '../../..');
const source = fs.readFileSync(path.join(root, 'demo/ours-kernel.hlsl'), 'utf8');
if (source !== OURS_KERNEL_HLSL) throw new Error('The author-owned HLSL file differs from its generator. Request an updated author handoff.');
const hash = value => createHash('sha256').update(value).digest('hex');
// Namespace global helpers and rename the two constant tokens before inclusion:
// Unreal defines PI as a macro, which would expand even inside a namespace.
const staged = '#ifndef MOIRE_GENERATED_KERNEL_USH\n#define MOIRE_GENERATED_KERNEL_USH\nnamespace MoireKernel {\n' +
  source.replace(/\bPI\b/g, 'MoirePi').replace(/\bTAU\b/g, 'MoireTau') +
  '\n}\n#endif\n';
const destination = path.join(project, 'Shaders/Moire/Generated');
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, 'Kernel.ush'), staged);
const record = {
  createdAt: new Date().toISOString(),
  source: 'demo/ours-kernel.hlsl', sourceSha256: hash(source),
  generator: 'demo/ours-kernel.wgsl.js',
  generatorSha256: hash(fs.readFileSync(path.join(root, 'demo/ours-kernel.wgsl.js'))),
  adapter: 'native/Unreal/MoireComparison/Scripts/stage_kernel.mjs',
  adapterSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  output: 'Shaders/Moire/Generated/Kernel.ush', outputSha256: hash(staged),
  transformation: 'Namespace MoireKernel; PI and TAU constant tokens renamed. No numerical or control-flow changes.',
};
fs.writeFileSync(path.join(destination, 'source.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
