// Emit the kernel's HLSL from the same portable source as the WGSL:
//   node demo/emit-hlsl.mjs   -> demo/ours-kernel.hlsl
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OURS_KERNEL_HLSL } from './ours-kernel.wgsl.js';
const out = fileURLToPath(new URL('./ours-kernel.hlsl', import.meta.url));
writeFileSync(out, OURS_KERNEL_HLSL);
console.log(`wrote ${out} (${OURS_KERNEL_HLSL.length} bytes)`);
