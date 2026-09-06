// For the noise mask g = 1{F > t}, F = sum a_i sin(theta_i + phi_i) on T^3: the boundary points whose
// normal is parallel to a direction u (the stationary points of the phase u.theta on the level surface),
// and the Gaussian curvature of the level surface there. If the curvature vanishes at a stationary
// point for u in the cone around the kernel direction, the |m|^-2 envelope degrades there.
// Exploratory only (collaborator's #132, #133): the sign-change scan misses tangent and endpoint roots, and
// sampled minima certify nothing; the certificate needs interval root exclusion on the explicit equations.
import { MASK } from '../../../../demo/mask-table.js';
const a = MASK.a, ph = MASK.ph, t0 = MASK.t0, K = MASK.k;
const det = (p, q) => p[0] * q[1] - p[1] * q[0];
const v = [det(K[1], K[2]), -det(K[0], K[2]), det(K[0], K[1])]; const vn = Math.hypot(...v); for (let i = 0; i < 3; i++) v[i] /= vn;
// stationary points: grad F = (a_i cos(theta_i + phi_i)) parallel to u: cos(psi_i) = lam u_i / a_i, psi_i = theta_i + phi_i,
// with F = sum a_i sin(psi_i) = t0 and sin(psi_i) = s_i sqrt(1 - (lam u_i / a_i)^2), s_i = +-1.
function stationary(u) {
  const out = [];
  const lamMax = Math.min(...[0, 1, 2].map((i) => a[i] / Math.max(1e-12, Math.abs(u[i]))));
  for (const signs of [[1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],[-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1]]) {
    const G = (lam) => [0, 1, 2].reduce((s, i) => s + a[i] * signs[i] * Math.sqrt(Math.max(0, 1 - (lam * u[i] / a[i]) ** 2)), 0) - t0;
    // scan lam in (-lamMax, lamMax) for sign changes of G (both signs of lam: grad F = lam u)
    const N = 4000; let prev = G(-lamMax + 1e-9), lp = -lamMax + 1e-9;
    for (let j = 1; j <= N; j++) {
      const lam = -lamMax + (2 * lamMax) * j / N - 1e-9; const g = G(lam);
      if (prev * g < 0) { let lo = lp, hi = lam; for (let k = 0; k < 60; k++) { const mid = 0.5 * (lo + hi); if (G(lo) * G(mid) <= 0) hi = mid; else lo = mid; } const l = 0.5 * (lo + hi);
        const psi = [0, 1, 2].map((i) => Math.atan2(signs[i] * Math.sqrt(Math.max(0, 1 - (l * u[i] / a[i]) ** 2)), l * u[i] / a[i]));
        const grad = psi.map((p, i) => a[i] * Math.cos(p)); const h = psi.map((p, i) => -a[i] * Math.sin(p));
        const gn2 = grad[0] ** 2 + grad[1] ** 2 + grad[2] ** 2;
        const Kg = (grad[0] ** 2 * h[1] * h[2] + grad[1] ** 2 * h[0] * h[2] + grad[2] ** 2 * h[0] * h[1]) / (gn2 * gn2);
        // mean curvature too, to tell parabolic from flat
        out.push({ signs: signs.join(''), lam: +l.toFixed(4), psi: psi.map((p) => +p.toFixed(3)), gradNorm: +Math.sqrt(gn2).toFixed(4), gaussK: +Kg.toExponential(3) });
      }
      prev = g; lp = lam;
    }
  }
  return out;
}
console.log('kernel direction v =', v.map((x) => +x.toFixed(4)));
console.log('stationary points of v.theta on {F = 0.3}, Gaussian curvature of the level surface there:');
for (const p of stationary(v)) console.log(' ', JSON.stringify(p));
// the first rungs' directions and a few random directions in a cone of half-angle 0.15 rad around v
const dirs = [[-10, 4, -5], [-12, 5, -6], [-2, 1, -1], [22, -9, 11], [-32, 13, -16]];
let minAbsK = Infinity, worst = null;
for (const m of dirs) { const n = Math.hypot(...m); const u = m.map((x) => x / n); const sp = stationary(u); const ang = Math.acos(Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2])); const ks = sp.map((p) => Math.abs(p.gaussK)); const mn = Math.min(...ks); console.log(`rung ${m} angle to v ${ang.toFixed(4)} rad: ${sp.length} stationary points, min |K| ${mn.toExponential(2)}, max |K| ${Math.max(...ks).toExponential(2)}`); if (mn < minAbsK) { minAbsK = mn; worst = m; } }
// random cone sample
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
let coneMin = Infinity; let coneCount = 0;
for (let i = 0; i < 400; i++) { const r = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]; const rv = r[0] * v[0] + r[1] * v[1] + r[2] * v[2]; const d = r.map((x, j) => x - rv * v[j]); // orthogonal projection (the first version subtracted (r_j v_j) v_j, a bug the collaborator found in #133; the cone numbers quoted in the notes predate this fix and are observations only) const dn = Math.hypot(...d); const ang = 0.15 * Math.sqrt(rnd()); const u = v.map((x, j) => Math.cos(ang) * x + Math.sin(ang) * d[j] / dn); const sp = stationary(u); for (const p of sp) { coneCount++; if (Math.abs(p.gaussK) < coneMin) coneMin = Math.abs(p.gaussK); } }
console.log(`cone of half-angle 0.15 rad around v, 400 directions: ${coneCount} stationary points, min |Gaussian curvature| ${coneMin.toExponential(2)}`);
