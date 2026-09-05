// CPU run of the demo's ours kernel through a WGSL interpreter (wgsl_reflect's
// WgslExec) against a brute-force window average of the demo's shade(). The
// interpreter executes the shader text itself, so what is checked is the code
// the GPU compiles, not a transcription.
//
// needs wgsl_reflect (not a repo dependency): npm install --no-save wgsl_reflect
// or point WGSL_REFLECT at a directory that has node_modules/wgsl_reflect.
// usage: node demo/tests/ripples-cpu.mjs [--scene 0|2] [x,y ...] [--mode N] [--grid N]
//        [--stub line|spectral] [--sub 'from=>to' ...] [--frozen] [--nodisp] [--flatlight]
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { COMMON } from '../wgsl.js';
import { OURS_KERNEL_CORE, ripplesWith, RIPPLES_LINE, RIPPLES_SPECTRAL, RIPPLES_LINE_STUB, RIPPLES_SPECTRAL_STUB } from '../ours-kernel-next.wgsl.js';

const loadInterpreter = async () => {
  const bases = [process.env.WGSL_REFLECT, process.cwd(), new URL('../..', import.meta.url).pathname].filter(Boolean);
  for (const base of bases) {
    try {
      const req = createRequire(base.endsWith('/') ? base : base + '/');
      return await import(pathToFileURL(req.resolve('wgsl_reflect/wgsl_reflect.module.js')).href);
    } catch (e) { /* next */ }
  }
  console.error('wgsl_reflect not found: npm install --no-save wgsl_reflect, or set WGSL_REFLECT');
  process.exit(2);
};
const { WgslParser, WgslExec } = await loadInterpreter();

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const scene = Number(opt('--scene', 2));
const mode = Number(opt('--mode', 0));
const grid = Number(opt('--grid', 1001));
const stub = opt('--stub', 'none'); // none | line | spectral
// --sub 'from=>to' (repeatable): textual variants of the kernel for bisecting
const subs = []; args.forEach((a, i) => { if (a === '--sub') subs.push(args[i + 1].split('=>')); });
const pixels = args.filter((a) => /^\d+,\d+$/.test(a)).map((a) => a.split(',').map(Number));
if (!pixels.length) for (const y of [150, 100, 60, 40, 30, 20, 12, 8, 5, 3, 1]) pixels.push([120, y]);

const LIGHT = [0.22808577638091165, 0.60822873701576452, 0.76028592126970562];
const SIG = 0.5;
const PERIOD = 20;
// the demo's YB homography (rest): s = -50 (x - 240) / (y + 1), t = -12000 / (y + 1)
const H = { hu: [-50, 0, 12000], hv: [0, 0, -12000], hd: [0, 1, 1] };

// the demo's shade() in JS
const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const fract = (v) => v - Math.floor(v);
const checker = (s, t) => { const ss = fract(s / PERIOD) >= 0.5 ? 1 : 0; const tt = fract(t / PERIOD) >= 0.5 ? 1 : 0; return ss * tt + (1 - ss) * (1 - tt); };
const frozen = args.includes('--frozen');
const nodisp = args.includes('--nodisp'); // no parallax displacement in the reference
const flat = args.includes('--flatlight'); // LN = 1, no specular in the reference // the viewer frozen at the pixel centre, as the kernel takes it
function shade(x, y, sc, vfix = null) {
  const D = H.hd[0] * x + H.hd[1] * y + H.hd[2];
  if (D <= 0) return 0;
  const s = (H.hu[0] * x + H.hu[1] * y + H.hu[2]) / D;
  const t = (H.hv[0] * x + H.hv[1] * y + H.hv[2]) / D;
  const viewer = vfix || norm([x - 240, 240, y + 1]);
  if (sc === 2) {
    const r = Math.hypot(s, t);
    const theta = 3 * r;
    const h = Math.sin(theta) / 3;
    const rinv = 1 / Math.max(r, 1e-9);
    const n = norm([s * rinv * Math.cos(theta), t * rinv * Math.cos(theta), 1]);
    const P = nodisp ? checker(s, t) : checker(s + h * viewer[0], t + h * viewer[1]);
    if (flat) return P;
    const LN = Math.max(dot(LIGHT, n), 0);
    const R = n.map((c, i) => 2 * LN * c - LIGHT[i]);
    const spec = Math.pow(Math.max(dot(R, viewer), 0), 50);
    return LN * P + spec;
  }
  const P = checker(s, t);
  const LN = Math.max(LIGHT[2], 0);
  const R = [-LIGHT[0], -LIGHT[1], 2 * LN - LIGHT[2]];
  const spec = Math.pow(Math.max(dot(R, viewer), 0), 50);
  return LN * P + spec;
}
// Gaussian window average: a jittered grid (no aliasing bias against the
// counts' periods), +-4.5 sigma, N x N cells; a fixed hash keeps it repeatable
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
function brute(x, y, sc, N = grid) {
  let acc = 0, wsum = 0;
  const vfix = frozen ? norm([x - 240, 240, y + 1]) : null;
  const Rr = 4.5 * SIG;
  seed = 12345 + 7919 * x + 104729 * y;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const dx = -Rr + (2 * Rr * (i + rnd())) / N;
      const dy = -Rr + (2 * Rr * (j + rnd())) / N;
      const w = Math.exp((-0.5 * (dx * dx + dy * dy)) / (SIG * SIG));
      acc += w * shade(x + dx, y + dy, sc, vfix);
      wsum += w;
    }
  }
  return acc / wsum;
}

// the kernel + a compute entry
const line = stub === 'line' ? RIPPLES_LINE_STUB : RIPPLES_LINE;
const spectral = stub === 'spectral' ? RIPPLES_SPECTRAL_STUB : RIPPLES_SPECTRAL;
const KERNEL = OURS_KERNEL_CORE + ripplesWith(line, spectral);
const ENTRY = /* wgsl */ `
@group(0) @binding(1) var<storage, read> inp: array<f32>;
@group(0) @binding(2) var<storage, read_write> outp: array<f32>;
@compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3u) {
  let i: u32 = id.x;
  let x: f32 = inp[i * 4u];
  let y: f32 = inp[i * 4u + 1u];
  let mode: u32 = u32(inp[i * 4u + 2u]);
  let which: u32 = u32(inp[i * 4u + 3u]);
  let g = ground(x, y);
  let S: f32 = U.p0.x * U.p0.x;
  let period: f32 = U.p1.w;
  WORK = 0.0;
  var rr: vec2f = vec2f(0.0, 0.0);
  if (which == 2u) {
    rr = ripplesMeanHMode(U.hu.xyz, U.hv.xyz, U.hd.xyz, x, y, period, S, g.viewer, U.light.xyz, mode);
  } else {
    let r = checkerMeanHMode(U.hu.xyz, U.hv.xyz, U.hd.xyz, x, y, period, S, mode);
    rr = vec2f(lightingLN() * r.x + lightingSpec(g.viewer, 50.0), r.y);
  }
  outp[i * 4u] = rr.x;
  outp[i * 4u + 1u] = rr.y;
  outp[i * 4u + 2u] = WORK;
  outp[i * 4u + 3u] = 1.0;
}
`;
// the interpreter cannot hold a bool inside a struct: the harness's copy carries it as u32
const forInterp = (t) => t
  .replace('low: f32, ok: bool }', 'low: f32, ok: u32 }')
  .replace(/E\.ok = true;/g, 'E.ok = 1u;')
  .replace(/E\.ok = false;/g, 'E.ok = 0u;')
  .replace('if (!eu.ok || !ev.ok)', 'if (eu.ok == 0u || ev.ok == 0u)')
  .replace('psiRate <= 2.0 && eu.ok && ev.ok', 'psiRate <= 2.0 && eu.ok == 1u && ev.ok == 1u');
let code = forInterp(COMMON + KERNEL + ENTRY);
for (const [a, b] of subs) { if (!code.includes(a)) console.log(`warning: sub not found: ${a}`); code = code.split(a).join(b); }
if (/\.ok\b(?! ==)/.test(code.replace(/E\.ok = [01]u/g, ''))) console.log('warning: an unpatched .ok remains');
const t0 = performance.now();
const ast = new WgslParser().parse(code);
const exec = new WgslExec(ast);
console.log(`parsed ${code.length} chars in ${(performance.now() - t0).toFixed(0)} ms`);

const uni = new Float32Array(64);
uni.set([...H.hu, 0], 0);
uni.set([...H.hv, 0], 4);
uni.set([...H.hd, 0], 8);
uni.set([...LIGHT, 0], 36);
uni.set([0, 0, 0, 1], 40);
uni.set([240, 160, 1 / 240, 1 / 160], 44);
uni.set([SIG, 0, 0, 0], 48);
uni.set([0, 0, scene, PERIOD], 52);
uni.set([0.1, 1, 0, mode], 56);

const n = pixels.length;
const inp = new Float32Array(n * 4);
const out = new Float32Array(n * 4);
pixels.forEach(([x, y], i) => inp.set([x, y, mode, scene], i * 4));
console.log(`scene ${scene} mode ${mode} stub ${stub}: ${n} pixels`);
console.log('x,y      ours      brute     diff      regime  work   ms');
for (let i = 0; i < n; i++) {
  const [x, y] = pixels[i];
  const one = new Float32Array(4); one.set(inp.subarray(i * 4, i * 4 + 4));
  const oo = new Float32Array(4);
  const t1 = performance.now();
  try {
    exec.dispatchWorkgroups('main', [1, 1, 1], { 0: { 0: { uniform: uni }, 1: one, 2: oo } });
  } catch (e) {
    console.log(`${x},${y}: interpreter error: ${e.message}`);
    continue;
  }
  const ms = performance.now() - t1;
  const b = brute(x, y, scene);
  console.log(`${String(x).padEnd(3)},${String(y).padEnd(4)} ${oo[0].toFixed(5).padStart(9)} ${b.toFixed(5).padStart(9)} ${(oo[0] - b).toExponential(2).padStart(10)}  ${oo[1].toFixed(0).padStart(3)}    ${oo[2].toFixed(0).padStart(4)}  ${ms.toFixed(0)}`);
}
