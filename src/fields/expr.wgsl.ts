// @ts-nocheck — wgslFn includes are FunctionNodes at runtime.
import { wgslFn } from 'three/tsl';
import { EXPR_EPS, type CompiledField } from './expr.ts';
import { emitField, f32, wgslBackend } from './emit.ts';

/**
 * The three.js glue for `emit.ts`: one generated `wgslFn` per layer that carries
 * a field. See `emit.ts` for why the shader unrolls a program instead of
 * interpreting one.
 */

/** Keeps a divisor away from zero without flipping its sign. */
export const EXPR_GUARD_WGSL = `
fn exprGuard(v: f32) -> f32 {
  if (v < 0.0) {
    return min(v, -${f32(EXPR_EPS.den)});
  }
  return max(v, ${f32(EXPR_EPS.den)});
}
`;

const exprGuard = wgslFn(EXPR_GUARD_WGSL);

/**
 * The WGSL for one field: a scalar and its gradient, in layer coordinates, as
 * `vec3(f, df/dx, df/dy)`.
 *
 * The field is normalised so it is dimensionless and O(1) over the box
 * `|q| < scale`, and the partials come back per world unit — the renderer divides
 * stroke widths by that slope, so the two have to be in the same units as `q`.
 *
 * Text rather than a node, so that the measurement harness in
 * `paper/tools/gpu/probe.mjs` can compile exactly what ships.
 */
export function fieldWgsl(compiled: CompiledField, name: string): string {
  const { body, result } = emitField(compiled, wgslBackend);
  // A program that pushes nothing samples as flat zero, which is how an empty
  // expression reads as "no field" rather than as a failure.
  const tail = result
    ? `return vec3<f32>(${result.v}, (${result.y}) / L, (${result.z}) / L);`
    : 'return vec3<f32>(0.0, 0.0, 0.0);';
  return `
fn ${name}(q: vec2<f32>, scale: f32) -> vec3<f32> {
  let L = max(abs(scale), 1e-3);
  let ux = q.x / L;
  let uy = q.y / L;
${body.map((line) => `  ${line}`).join('\n')}
  ${tail}
}
`;
}

/**
 * `fieldWgsl` as a callable node.
 *
 * `name` has to be unique across the material: `wgslFn` keys a function by the
 * name in its source, so it is one name per layer slot.
 */
export function fieldFunction(compiled: CompiledField, name: string) {
  const source = fieldWgsl(compiled, name);
  return wgslFn(source, source.includes('exprGuard(') ? [exprGuard] : []);
}
