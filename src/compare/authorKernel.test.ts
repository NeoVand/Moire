import assert from 'node:assert/strict';
import WGSLNodeFunction from 'three/src/renderers/webgpu/nodes/WGSLNodeFunction.js';
import { OURS_KERNEL } from '../../demo/ours-kernel.wgsl.js';
import {
  authorChecker, authorCheckerWGSL,
  authorHomographyChecker, authorHomographyCheckerWGSL,
} from './authorKernel.ts';

// Exercise the actual parser used by Three, since starting this module with
// a helper or a struct silently produces the wrong callable TSL signature.
const parsed = new WGSLNodeFunction(authorCheckerWGSL);
assert.equal(parsed.name, 'comparisonAuthorChecker');
assert.equal(parsed.type, 'float');
assert.deepEqual(parsed.inputs.map(input => [input.name, input.type]), [
  ['q', 'vec2'], ['dx', 'vec2'], ['dy', 'vec2'], ['dxx', 'vec2'],
  ['dxy', 'vec2'], ['dyy', 'vec2'], ['sigma', 'float'],
]);
const emitted = parsed.getCode();
assert.ok(authorCheckerWGSL.endsWith(OURS_KERNEL), 'The adapter must import the shared module verbatim.');
// Three trims only the surrounding module whitespace while parsing it.
assert.ok(emitted.endsWith(OURS_KERNEL.trimEnd()), 'The shared module must survive Three parsing intact.');
assert.equal(emitted.split(OURS_KERNEL.trimEnd()).length - 1, 1, 'The shared module must occur exactly once.');
assert.equal(typeof authorChecker, 'function');

// Global declarations cannot be independently included once per helper or
// WGSL compilation fails. This guards the module assembly, not its math.
for (const pattern of [/\bfn\s+(\w+)\s*\(/g, /\bstruct\s+(\w+)\s*\{/g, /^const\s+(\w+)\b/gm]) {
  const names = [...emitted.matchAll(pattern)].map(match => match[1]);
  assert.equal(new Set(names).size, names.length, `Duplicate global declarations: ${names.join(', ')}`);
}
assert.equal((emitted.match(/\bconst PI:/g) || []).length, 1);
assert.equal((emitted.match(/\bconst TAU:/g) || []).length, 1);
console.log(`Author kernel adapter: Three parsed the 7-argument scalar wrapper and retained ${OURS_KERNEL.length} shared WGSL characters exactly once.`);

const homography = new WGSLNodeFunction(authorHomographyCheckerWGSL);
assert.equal(homography.name, 'comparisonAuthorHomographyChecker');
assert.equal(homography.type, 'float');
assert.deepEqual(homography.inputs.map(input => [input.name, input.type]), [
  ['hu', 'vec3'], ['hv', 'vec3'], ['hd', 'vec3'], ['point', 'vec2'], ['sigma', 'float'],
]);
const emittedHomography = homography.getCode();
assert.ok(authorHomographyCheckerWGSL.endsWith(OURS_KERNEL));
assert.ok(emittedHomography.endsWith(OURS_KERNEL.trimEnd()));
assert.equal(emittedHomography.split(OURS_KERNEL.trimEnd()).length - 1, 1);
assert.equal(typeof authorHomographyChecker, 'function');
for (const pattern of [/\bfn\s+(\w+)\s*\(/g, /\bstruct\s+(\w+)\s*\{/g, /^const\s+(\w+)\b/gm]) {
  const names = [...emittedHomography.matchAll(pattern)].map(match => match[1]);
  assert.equal(new Set(names).size, names.length, `Duplicate homography-module declarations: ${names.join(', ')}`);
}
assert.equal((emittedHomography.match(/\bconst PI:/g) || []).length, 1);
assert.equal((emittedHomography.match(/\bconst TAU:/g) || []).length, 1);
console.log('Author homography adapter: Three parsed normalized rows, explicit pixel center, and sigma; the shared module is retained once.');
