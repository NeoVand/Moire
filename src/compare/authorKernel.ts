import { wgslFn } from 'three/tsl';
// The author owns this shared JavaScript shader module; keep a direct import so
// fixes reach both harnesses without maintaining another copy of the kernel.
// @ts-expect-error The shared WGSL module is JavaScript without a declaration file.
import { OURS_KERNEL } from '../../demo/ours-kernel.wgsl.js';

/**
 * Thin material adapter to the author's shared checker kernel.
 *
 * q is already in checker periods. dx/dy are device-pixel gradients; dxx,
 * dxy, dyy are its exact homography Hessians, paired as (u,v). The caller
 * supplies its pixel center and handles the ground/sky edge and display.
 * sigma is the positive Gaussian standard deviation (0.5 in this demo), so
 * the kernel receives sigma².
 * The result preserves the shared kernel's equal-parity checker and is not
 * clamped or otherwise altered by this adapter.
 *
 * The shared kernel currently uses approximate coverage and capped spectral
 * enumeration on quadratic phases. This adapter adds neither exact depth
 * conditioning nor a whole-image error guarantee. Use this singleton node
 * throughout a material so Three emits the shared module only once.
 */
export const authorCheckerWGSL = /* wgsl */ `
fn comparisonAuthorChecker(q: vec2f, dx: vec2f, dy: vec2f,
  dxx: vec2f, dxy: vec2f, dyy: vec2f, sigma: f32) -> f32 {
  var J: Jets;
  J.u0 = q.x;
  J.v0 = q.y;
  J.gu = vec2f(dx.x, dy.x);
  J.gv = vec2f(dx.y, dy.y);
  J.Hu = vec3f(dxx.x, dxy.x, dyy.x);
  J.Hv = vec3f(dxx.y, dxy.y, dyy.y);
  return checkerMean(J, sigma * sigma).x;
}

const PI: f32 = 3.141592653589793;
const TAU: f32 = 6.283185307179586;

${OURS_KERNEL}`;

// Three parses only the first function's declaration. Keeping the callable
// wrapper first lets it infer built-in input types while preserving every
// later constant, struct, and helper in the emitted WGSL module.
export const authorChecker = wgslFn(authorCheckerWGSL);
