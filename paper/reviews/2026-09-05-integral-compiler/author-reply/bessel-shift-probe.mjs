// Run from any directory: node /path/to/bessel-shift-probe.mjs
// Optional: MOIRE_REPO=/path/to/Moire; --out /path/to/new-results.jsonl.
// Default output is a unique timestamped file in runs/. Existing files are never overwritten.
// No compiler files are edited. Private functions are exported from a temporary
// byte-for-byte source copy, and the actual benchmark is traced through it.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const here = fileURLToPath(new URL('.', import.meta.url));
let output;
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--out' && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) output = resolve(process.argv[++i]);
  else if (arg.startsWith('--out=') && arg.length > 6) output = resolve(arg.slice(6));
  else throw new Error('Usage: node bessel-shift-probe.mjs [--out NEW_FILE.jsonl]');
}
output ??= join(here, 'runs', `bessel-shift-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.jsonl`);
const repo = process.env.MOIRE_REPO || fileURLToPath(new URL('../../../../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'moire-bessel-'));
const TAU = 2 * Math.PI;
const rows = [];
const start = performance.now();
const emit = (row) => rows.push(row);
const err = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

// Miller downward recurrence, normalized by J0 + 2 J2 + 2 J4 + ... = 1.
// It is checked independently against a converged periodic integral below.
// This double-precision reference is not a claimed GPU implementation.
function besselRow(z, requested = 160) {
  const az = Math.abs(z);
  if (az === 0) return (n) => n === 0 ? 1 : 0;
  const M = Math.max(requested, Math.ceil(az)) + 80;
  const a = new Float64Array(M + 2);
  a[M] = 1;
  for (let j = M; j > 0; j--) {
    a[j - 1] = (2 * j / az) * a[j] - a[j + 1];
    if (Math.abs(a[j - 1]) > 1e100) {
      for (let i = j - 1; i <= M + 1; i++) a[i] *= 1e-100;
    }
  }
  let den = a[0];
  for (let j = 2; j <= M; j += 2) den += 2 * a[j];
  return (n) => {
    const an = Math.abs(n);
    assert(an <= requested, 'Increase the reference order window');
    return a[an] / den * ((n < 0 && an % 2) ? -1 : 1) * ((z < 0 && an % 2) ? -1 : 1);
  };
}

function integral(fn, n, N = 4096) {
  let re = 0, im = 0;
  for (let i = 0; i < N; i++) {
    const s = (i + 0.5) / N;
    const v = fn(s), phase = -TAU * n * s;
    const c = Math.cos(phase), d = Math.sin(phase);
    re += v[0] * c - v[1] * d;
    im += v[0] * d + v[1] * c;
  }
  return [re / N, im / N];
}
const cis = (x) => [Math.cos(x), Math.sin(x)];
function generalized(A, B, n) {
  // exp(i[A sin(r) + B sin²(r)]): sin²(r) = (1-cos(2r))/2.
  const ja = besselRow(A), jb = besselRow(B / 2);
  let re = 0, im = 0;
  for (let j = -24; j <= 24; j++) {
    const v = jb(j) * ja(n - 2 * j), phase = -Math.PI * j / 2;
    re += v * Math.cos(phase); im += v * Math.sin(phase);
  }
  return cmul(cis(B / 2), [re, im]);
}

try {
  const manifest = {};
  for (const name of ['fjet.mjs', 'fjet-yb.mjs']) {
    const src = readFileSync(resolve(repo, 'paper/tools/exp', name), 'utf8');
    manifest[name] = { bytes: Buffer.byteLength(src), sha256: createHash('sha256').update(src).digest('hex') };
    writeFileSync(join(temp, name), src + (name === 'fjet.mjs' ? '\nexport { shiftTables, shiftAt, factorsAt };\n' : ''));
  }
  process.env.FJET_LIB = '1';
  delete process.env.FJET_PART;
  const F = await import(pathToFileURL(join(temp, 'fjet.mjs')));
  const Y = await import(pathToFileURL(join(temp, 'fjet-yb.mjs')));
  const settings = new F.Pixel();
  emit({ kind: 'protocol', source: manifest, case: 'sinQuadraticRipples', grid: settings.shiftNG,
    window: settings.shiftKW, dTheta: settings.shiftDTheta,
    tableConvention: 'Q(theta;n)=integral O(s) exp(i theta H(s)) exp(-2pi i n s) ds',
    scope: 'Actual private shiftTables function called directly with factors extracted from the actual shader trace; no full Pixel.expect or frame run.' });

  let refError = 0;
  for (const z of [-64, -24, -3.7, -0.05, 0, 0.05, 3.7, 24, 64]) {
    const j = besselRow(z);
    for (const n of [-16, -3, 0, 1, 8, 16]) {
      refError = Math.max(refError, err(integral(s => cis(z * Math.sin(TAU * s)), n), [j(n), 0]));
    }
  }
  assert(refError < 1e-12);
  emit({ kind: 'bessel_reference_check', maxAbsError: refError, integralSamples: 4096 });

  F.resetAxes();
  const cs = Y.CASES.find(c => c.name === 'sinQuadraticRipples');
  const el = cs.eval(Y.FJ, 300, 12, true)[0];
  const inner = el.axes().find(a => a.label === 'sin' && a.field);
  assert(inner && inner.field.terms.every(t => t.f.length === 1 && t.f[0].sig === 'sin'));
  const factor = inner.field.terms[0].f[0];
  const axis = factor.axis;
  assert(!axis.field);
  const H = { key: 'author-probe-actual-ripple-sine', sig: factor.sig, factors: [factor] };
  let shapeError = 0;
  for (let i = 0; i < 64; i++) {
    const s = (i + 0.5) / 64;
    shapeError = Math.max(shapeError, Math.abs(F.factorsAt(H.factors, new Map([[axis.id, s]])) - Math.sin(TAU * s)));
  }
  assert(shapeError < 1e-13);
  emit({ kind: 'extracted_shift_shape', H: 'sin(2pi s)', factorSignature: factor.sig,
    maxAbsShapeError: shapeError, innerFieldCoefficientCycles: inner.field.terms.reduce((s,t) => s+t.c.re.v, 0) });

  const tests = [-64, -40, -32, -24, -16, -5, -1, -0.05, 0, 0.05, 1, 5, 16, 24, 32, 40, 64];
  for (const N of [settings.shiftNG, 256]) {
    const T = F.shiftTables(H, [axis], [], N, settings.shiftKW, 64, settings.shiftDTheta);
    for (const theta of tests) {
      const j = besselRow(theta), e = [0, 0, 0];
      let worstN = 0;
      for (let n = -16; n <= 16; n++) {
        const out = new Float64Array(6);
        F.shiftAt(T, theta, n + 16, out);
        const want = [j(n), (j(n-1)-j(n+1))/2, (j(n-2)-2*j(n)+j(n+2))/4];
        for (let q=0;q<3;q++) {
          const d = Math.hypot(out[2*q]-want[q], out[2*q+1]);
          if (q===0 && d>e[0]) worstN=n;
          e[q]=Math.max(e[q],d);
        }
      }
      emit({ kind:'table_nodes', grid:N, theta, orders:[-16,16], maxAbsErrorQ:e[0], maxAbsErrorQ1:e[1], maxAbsErrorQ2:e[2], worstN });
      if (N===256 || Math.abs(theta)<=16) assert(Math.max(...e)<6e-8);
    }
    for (const theta of [-15.983, -5.017, -0.013, 0.013, 1.023, 5.017, 15.983]) {
      const j = besselRow(theta), e=[0,0,0];
      for (let n=-16;n<=16;n++) {
        const out=new Float64Array(6); F.shiftAt(T,theta,n+16,out);
        const want=[j(n),(j(n-1)-j(n+1))/2,(j(n-2)-2*j(n)+j(n+2))/4];
        for(let q=0;q<3;q++) e[q]=Math.max(e[q],Math.hypot(out[2*q]-want[q],out[2*q+1]));
      }
      emit({kind:'table_interpolation',grid:N,theta,maxAbsErrorQ:e[0],maxAbsErrorQ1:e[1],maxAbsErrorQ2:e[2]});
      assert(Math.max(...e)<5e-6);
    }
  }

  // Multiplicative closures change the coefficient to a convolution.
  const O={sig:'probe-1+.3cos',axes:[axis],fn:([s])=>F.Jet.c(1+.3*Math.cos(TAU*s))};
  const OT=F.shiftTables(H,[axis],[O],256,16,5,.05);
  let convolutionError=0, bareBesselError=0;
  const jo=besselRow(5);
  for(let n=-16;n<=16;n++) {
    const out=new Float64Array(6);F.shiftAt(OT,5,n+16,out);
    convolutionError=Math.max(convolutionError,err(out,[jo(n)+.15*(jo(n-1)+jo(n+1)),0]));
    bareBesselError=Math.max(bareBesselError,err(out,[jo(n),0]));
  }
  assert(convolutionError<6e-8);
  emit({kind:'multiplicative_closure',theta:5,O:'1+.3cos(2pi s)',maxConvolutionError:convolutionError,maxBareBesselError:bareBesselError});

  // Read the actual outer and inner count fields. Freeze smooth coefficients
  // at the pixel solely to test their torus coefficient, not the pixel mean.
  for(const [x,y] of [[300,12],[80,20],[420,80],[300,220]]) {
    F.resetAxes();const picture=cs.eval(Y.FJ,x,y,true)[0];
    const outer=picture.axes().find(a=>a.label==='fract');
    const inn=picture.axes().find(a=>a.label==='sin'&&a.field);
    const ripple=inn.field.terms[0].f[0].axis;
    let alpha=0,beta=0,innerAmplitude=0;
    for(const t of outer.field.terms) {
      assert(t.f.length===1);const f=t.f[0];
      if(f.axis.id===ripple.id && f.sig==='sin') alpha+=t.c.re.v;
      else if(f.axis.id===ripple.id && f.sig==='(sin*sin)') beta+=t.c.re.v;
      else if(f.axis.id===inn.id && f.sig==='sin') innerAmplitude+=t.c.re.v;
      else throw new Error('Actual trace changed; inspect its new field structure');
    }
    const gamma=TAU*inn.field.terms.reduce((s,t)=>s+t.c.re.v,0);
    emit({kind:'actual_trace',pixel:[x,y],alpha,beta,gamma,innerAmplitude,
      field:'alpha sin(r) + beta sin²(r) + innerAmplitude sin(psi + gamma sin(r))'});
    for(const k of [-16,-4,-1,1,4,16]) for(const m of [-2,0,2]) {
      const A=TAU*k*alpha+m*gamma, B=TAU*k*beta;
      const jm=besselRow(TAU*k*innerAmplitude)(m), ja=besselRow(A);
      let ge=0,se=0,ce=0;
      for(const n of [-16,-8,-3,-1,0,1,3,8,16]) {
        const direct=integral(s=>cis(A*Math.sin(TAU*s)+B*Math.sin(TAU*s)**2),n,4096);
        ge=Math.max(ge,err(direct,generalized(A,B,n)));
        se=Math.max(se,err(direct,[ja(n),0]));
        ce=Math.max(ce,Math.abs(jm)*err(direct,[ja(n),0]));
      }
      assert(ge<2e-12);
      emit({kind:'actual_ripple_recipe',pixel:[x,y],k,m,A,B,innerBessel:jm,
        maxGeneralizedError:ge,maxSingleBesselError:se,maxJointCoefficientSingleBesselError:ce});
    }
  }

  // Same-count composition merges the parent and sideband orders.
  const a=.2, coefficients=new Map([[1,[.5,0]],[-1,[.5,0]]]);
  let selfError=0;
  for(let ell=-12;ell<=12;ell++) {
    let predicted=0;
    for(const [k,c] of coefficients) predicted+=c[0]*besselRow(TAU*k*a)(ell-k);
    const direct=integral(u=>[Math.cos(TAU*(u+a*Math.sin(TAU*u))),0],ell);
    selfError=Math.max(selfError,err(direct,[predicted,0]));
  }
  assert(selfError<1e-12);
  emit({kind:'self_count',picture:'cos(2pi u)',amplitude:a,orders:[-12,12],maxAbsError:selfError,
    formula:'coefficient(ell)=sum_k pHat(k) J_(ell-k)(2pi k a)'});
  // Do not discard a carrier using its unmixed frequency: its sideband can
  // cancel that frequency before the Gaussian multiplier is evaluated.
  for (const k of [1,4,8,16]) {
    const amplitude=1, sigma=.5, n=-k;
    const coefficient=besselRow(TAU*k*amplitude)(n);
    const integralDC=integral(u=>cis(TAU*k*(u+amplitude*Math.sin(TAU*u))),0);
    assert(err(integralDC,[coefficient,0])<2e-12);
    emit({kind:'mixed_frequency_resonance',k,n,amplitude,sigma,carrierGradient:[1,0],fieldGradient:[1,0],
      bareMultiplier:Math.exp(-2*Math.PI**2*sigma**2*k*k),mixedGradient:[0,0],mixedMultiplier:1,
      coefficient,maxAbsReferenceError:err(integralDC,[coefficient,0])});
  }
  emit({kind:'complete',milliseconds:performance.now()-start,rows:rows.length+1});
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output,rows.map(x=>JSON.stringify(x)).join('\n')+'\n', { flag: 'wx' });
  console.log(JSON.stringify({ ...rows.at(-1), output }));
} finally { rmSync(temp,{recursive:true,force:true}); }
