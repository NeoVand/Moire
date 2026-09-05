// The mask of scene 3: a quasi-periodic field F(s, t) = sum_i a_i sin(k_i . (s, t) + phi_i)
// thresholded at t0. Shared by the demo (the reference texture, the uniform) and the CPU
// harness; the kernel and the reference shader carry the same constants in WGSL.
//
// The far field of the kernel's node is the indicator's Fourier series on the torus of
// the three phases: g(theta) = 1{sum_i a_i sin theta_i > t0}, coefficients
// c_m = (2 pi)^-3 int g e^{-i m . theta}. g is invariant under theta -> pi - theta, so
// c_m is real when m1 + m2 + m3 is even and imaginary when odd; the table stores that
// one number per m. The table comes from a separable DFT on an N^3 grid; orders beyond
// N - M alias into it, which bounds its use to |m_i| <= M with N >= 4 M.

export const MASK = {
  t0: 0.3,
  a: [1, 0.8, 0.6],
  ph: [0, 1, 2],
  lam: [23, 17, 11],
  al: [0.3, 1.7, 2.9],
};
MASK.k = MASK.lam.map((l, i) => [(2 * Math.PI / l) * Math.cos(MASK.al[i]), (2 * Math.PI / l) * Math.sin(MASK.al[i])]);

export const maskField = (s, t) =>
  MASK.a[0] * Math.sin(MASK.k[0][0] * s + MASK.k[0][1] * t + MASK.ph[0]) +
  MASK.a[1] * Math.sin(MASK.k[1][0] * s + MASK.k[1][1] * t + MASK.ph[1]) +
  MASK.a[2] * Math.sin(MASK.k[2][0] * s + MASK.k[2][1] * t + MASK.ph[2]);

// the indicator on the torus
const g = (t1, t2, t3) => (MASK.a[0] * Math.sin(t1) + MASK.a[1] * Math.sin(t2) + MASK.a[2] * Math.sin(t3) > MASK.t0 ? 1 : 0);

// the coefficient table for |m_i| <= M from an N^3 grid: Float32Array of (2M+1)^3,
// index ((m1 + M) (2M + 1) + (m2 + M)) (2M + 1) + (m3 + M). Also returns the
// largest magnitude of the part that should vanish by symmetry, as a check.
export function maskCoefTable(M = 12, N = 64) {
  const W = 2 * M + 1;
  // samples g on the grid (theta_j = 2 pi (j + 1/2) / N)
  const grid = new Float64Array(N * N * N);
  const th = new Float64Array(N);
  for (let j = 0; j < N; j++) th[j] = (2 * Math.PI * (j + 0.5)) / N;
  const s1 = th.map((t) => MASK.a[0] * Math.sin(t));
  const s2 = th.map((t) => MASK.a[1] * Math.sin(t));
  const s3 = th.map((t) => MASK.a[2] * Math.sin(t));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) grid[(i * N + j) * N + k] = s1[i] + s2[j] + s3[k] > MASK.t0 ? 1 : 0;
  // the DFT kernel per axis: e^{-i m theta_j} for m in [-M, M]
  const cs = new Float64Array(W * N);
  const sn = new Float64Array(W * N);
  for (let m = -M; m <= M; m++) for (let j = 0; j < N; j++) { cs[(m + M) * N + j] = Math.cos(m * th[j]); sn[(m + M) * N + j] = -Math.sin(m * th[j]); }
  // axis 3 first: A[i][j][m3] complex
  const A_re = new Float64Array(N * N * W);
  const A_im = new Float64Array(N * N * W);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const base = (i * N + j) * N;
    for (let m = 0; m < W; m++) {
      let re = 0, im = 0;
      const cb = m * N;
      for (let k = 0; k < N; k++) { const v = grid[base + k]; if (v) { re += cs[cb + k]; im += sn[cb + k]; } }
      A_re[(i * N + j) * W + m] = re;
      A_im[(i * N + j) * W + m] = im;
    }
  }
  // axis 2: B[i][m2][m3]
  const B_re = new Float64Array(N * W * W);
  const B_im = new Float64Array(N * W * W);
  for (let i = 0; i < N; i++) for (let m2 = 0; m2 < W; m2++) {
    const cb = m2 * N;
    for (let m3 = 0; m3 < W; m3++) {
      let re = 0, im = 0;
      for (let j = 0; j < N; j++) { const ar = A_re[(i * N + j) * W + m3], ai = A_im[(i * N + j) * W + m3]; const c = cs[cb + j], s = sn[cb + j]; re += ar * c - ai * s; im += ar * s + ai * c; }
      B_re[(i * W + m2) * W + m3] = re;
      B_im[(i * W + m2) * W + m3] = im;
    }
  }
  // axis 1: C[m1][m2][m3]
  const table = new Float32Array(W * W * W);
  let vanish = 0;
  const norm = 1 / (N * N * N);
  for (let m1 = 0; m1 < W; m1++) {
    const cb = m1 * N;
    for (let m2 = 0; m2 < W; m2++) for (let m3 = 0; m3 < W; m3++) {
      let re = 0, im = 0;
      for (let i = 0; i < N; i++) { const br = B_re[(i * W + m2) * W + m3], bi = B_im[(i * W + m2) * W + m3]; const c = cs[cb + i], s = sn[cb + i]; re += br * c - bi * s; im += br * s + bi * c; }
      re *= norm; im *= norm;
      const odd = ((m1 + m2 + m3 - 3 * M) & 1) === 1;
      table[(m1 * W + m2) * W + m3] = odd ? im : re;
      vanish = Math.max(vanish, Math.abs(odd ? re : im));
    }
  }
  return { table, M, N, vanish, mean: table[(M * W + M) * W + M] };
}
