// The CPU replica of the shader's series synthesis (composite.ts,
// poolSynthSource, used for three and four families and for the envelope's
// stream frames; one and two families use the direct window integral,
// poolDirect): the drawing's Fourier series in the phases, each term
// under the pixel's Gaussian window at its own two-dimensional frequency,
// for K = 2 with black ink on a white ground, checked against a brute-force
// window average of the drawing itself. The formulas here are the WGSL's,
// transcribed by hand -- keep them in step. Run: node paper/tools/exp/synth-check.mjs
// The shipped answer is M8; M3 is kept to show why a pair needs eight harmonics.
// brute-force window average of the drawing. Black ink on a white ground.
const sinc = (x) => { const px = Math.PI * x; return Math.abs(px) < 1e-6 ? 1 : Math.sin(px) / px; };
const trap = (d, h, r) => { // smoothstep ramp, as drawn
  const a = Math.abs(d);
  if (a <= h - r) return 1; if (a >= h + r) return 0; const t = (a - (h - r)) / (2 * r); return 1 - (3 * t * t - 2 * t * t * t);
};
const ramp = (a) => (a < 1e-2 ? 1 - a * a / 40 : (12 * (2 * Math.sin(a / 2) - a * Math.cos(a / 2))) / (a * a * a));
const coeffs = (h, r, M) => {
  const F = [], Q = [];
  for (let m = 0; m <= M; m++) {
    F.push(m === 0 ? 2 * h : Math.sin(2 * Math.PI * m * h) / (Math.PI * m) * ramp(4 * Math.PI * r * m));
    Q.push(0.514 * r * Math.cos(2 * Math.PI * m * h) * ramp(0.824 * 4 * Math.PI * r * m));
  }
  return { F, Q };
};
// series, K=2, bg white, inks black: c = (1-a1)(1-a2)
const series = (L, phi, G, sigma, M, sq) => {
  const c = L.map((l) => coeffs(l.h, l.r, M));
  const sig2 = 2 * Math.PI * Math.PI * sigma * sigma;
  let acc = 0;
  for (let m0 = -M; m0 <= M; m0++) for (let m1 = -M; m1 <= M; m1++) {
    const kx = m0 * G[0][0] + m1 * G[1][0], ky = m0 * G[0][1] + m1 * G[1][1];
    const mm = Math.max(Math.abs(kx), Math.abs(ky));
    if (mm >= 0.5) continue;
    const W = Math.exp(-sig2 * (kx * kx + ky * ky));
    const cw = Math.cos(2 * Math.PI * (m0 * phi[0] + m1 * phi[1])) * W;
    const f = [m0, m1].map((m, i) => {
      const al = L[i].al, Fv = c[i].F[Math.abs(m)], Qv = c[i].Q[Math.abs(m)], d = m === 0 ? 1 : 0;
      const b = d - al * Fv;
      const bb = d - al * (2 - al) * Fv - al * al * Qv;
      return sq ? bb : b;
    });
    acc += cw * f[0] * f[1];
  }
  return acc;
};
const brute = (L, phi, G, sigma, sq) => {
  const R = 4 * sigma, n = 160; let sum = 0, wsum = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -R + (2 * R * (i + 0.5)) / n, y = -R + (2 * R * (j + 0.5)) / n;
    const w = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
    let c = 1;
    L.forEach((l, k) => {
      const p = phi[k] + G[k][0] * x + G[k][1] * y;
      const d = p - Math.round(p);
      c *= 1 - l.al * trap(d, l.h, l.r);
    });
    sum += w * (sq ? c * c : c); wsum += w;
  }
  return sum / wsum;
};
const run = (label, L, phi, G, sigma) => {
  for (const sq of [false, true]) {
    const b = brute(L, phi, G, sigma, sq);
    const s3 = series(L, phi, G, sigma, 3, sq), s8 = series(L, phi, G, sigma, 8, sq);
    console.log(`${label} ${sq ? 'E[c²]' : 'E[c] '} brute ${b.toFixed(4)}  M3 ${s3.toFixed(4)}  M8 ${s8.toFixed(4)}`);
  }
};
// 12 px a period, floored hairline h=1.15 px, ramp 0.7 px, in register, parallel
run('coarse in-register ', [{ h: 1.15 / 12, r: 0.7 / 12, al: 1 }, { h: 1.15 / 12, r: 0.7 / 12, al: 1 }], [0.2, 0.2], [[1 / 12, 0], [1 / 12, 0]], 0.8);
run('coarse half-offset ', [{ h: 1.15 / 12, r: 0.7 / 12, al: 1 }, { h: 1.15 / 12, r: 0.7 / 12, al: 1 }], [0.2, 0.7], [[1 / 12, 0], [1 / 12, 0]], 0.8);
// duty-half pair, crossing at 90 degrees, 6 px a period
run('duty-half crossing ', [{ h: 0.25, r: 0.7 / 6, al: 1 }, { h: 0.25, r: 0.7 / 6, al: 1 }], [0.1, 0.3], [[1 / 6, 0], [0, 1 / 6]], 0.8);
// hard duty-0.45 pair in register at 3.6 px a period, rest window sigma = half pitch
run('hard in-register   ', [{ h: 0.225, r: 0, al: 1 }, { h: 0.225, r: 0, al: 1 }], [0.1, 0.1], [[1 / 3.6, 0], [1 / 3.6, 0]], Math.sqrt(0.64 + 1.8 * 1.8));
run('hard half-offset   ', [{ h: 0.225, r: 0, al: 1 }, { h: 0.225, r: 0, al: 1 }], [0.1, 0.6], [[1 / 3.6, 0], [1 / 3.6, 0]], Math.sqrt(0.64 + 1.8 * 1.8));
// 2:1 pair, coarse duty 1/2 (12 px) and fine duty 1/2 (6 px), square law
run('2:1 duty-half      ', [{ h: 0.25, r: 0.7 / 12, al: 1 }, { h: 0.25, r: 0.7 / 6, al: 1 }], [0.13, 0.41], [[1 / 12, 0], [1 / 6, 0]], 0.8);
