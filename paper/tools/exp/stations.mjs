// Which convergents are stations, exactly. A pair at pitch ratio x (coarse
// over fine) beats visibly in the character (h_n, -k_n) built from the n-th
// convergent h_n/k_n of x, and its weighted merit — the heterodyne ratio
// times the amplitude weight h_n k_n — has a closed form in the continued
// fraction: with x_{n+1} the complete quotient,
//
//     eta_n = 2 h_n k_n / ((h_n + k_n x) (x_{n+1} k_n + k_{n-1})),
//
// because |h_n - k_n x| = 1 / (x_{n+1} k_n + k_{n-1}). As n grows this is
// Perron's k_n |k_n x - h_n| = 1 / (x_{n+1} + k_{n-1}/k_n): the visibility
// spectrum priced by |pq| is the classical sequence of convergent qualities,
// not a new object, and the theory's contribution is the threshold — a
// convergent is a visible station (eta < 1/4) exactly when
// x_{n+1} + k_{n-1}/k_n exceeds 8 / (1 + k_n x / h_n), about 4. A next partial
// quotient of five or more guarantees a station, two or fewer forbids one, and
// the golden ratio, all of whose quotients are one, sits at Hurwitz's 1/sqrt5
// at every order: a desert. Writes paper/data/stations.json.
// Run: node paper/tools/exp/stations.mjs

import { writeFileSync } from 'node:fs';

const OUT = new URL('../../data/stations.json', import.meta.url);
const gates = [];
const gate = (name, ok, detail) => {
  gates.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
};

/** Continued fraction of x to depth N: partial quotients, complete quotients,
 * convergents h/k, and k_{n-1} beside each. */
function expand(x, N) {
  const rows = [];
  let xn = x;
  let hPrev = 1;
  let hPrev2 = 0;
  let kPrev = 0;
  let kPrev2 = 1;
  for (let n = 0; n < N; n += 1) {
    const a = Math.floor(xn);
    const h = a * hPrev + hPrev2;
    const k = a * kPrev + kPrev2;
    const frac = xn - a;
    if (frac < 1e-12) {
      rows.push({ n, a, xNext: Infinity, h, k, kPrev, exact: true });
      break;
    }
    const xNext = 1 / frac;
    rows.push({ n, a, xNext, h, k, kPrev, exact: false });
    hPrev2 = hPrev;
    hPrev = h;
    kPrev2 = kPrev;
    kPrev = k;
    xn = xNext;
    // Doubles carry about fifteen digits; past k ~ 1e6 the expansion is noise.
    if (k > 3e6) break;
  }
  return rows;
}

/** The scan's weighted merit of (h, -k) on a coarse : fine pair at ratio x,
 * unfloored, straight from Definition merit. */
const direct = (x, h, k) => {
  const gP = 1 / x;
  const gQ = 1;
  const beat = Math.abs(h * gP - k * gQ);
  const carrier = Math.abs(h * gP + k * gQ);
  return (beat / (0.5 * carrier)) * h * k;
};
/** The closed form. */
const closed = (x, r) =>
  r.exact ? 0 : (2 * r.h * r.k) / ((r.h + r.k * x) * (r.xNext * r.k + r.kPrev));
/** The threshold quantity and its bound. */
const quotient = (r) => r.xNext + r.kPrev / r.k;
const bound = (x, r) => 8 / (1 + (r.k * x) / r.h);

let seed = 41;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

// ---------------------------------------------------------- 1. the identity
// Exact arithmetic: a random RATIONAL ratio P/Q, its continued fraction by
// Euclid, its complete quotients as exact fractions, and both sides of the
// identity as integers to compare — no double ever rounds. The same fractions
// decide the threshold exactly (4 eta < 1 as integers) and the partial-quotient
// rules; only the Perron limit, a statement about n -> infinity, is read off
// as a ratio of doubles, which is what it is.
const abs = (v) => (v < 0n ? -v : v);
function expandExact(P, Q) {
  // Rows: n, a, h, k, kPrev, and the complete quotient x_{n+1} = Pn/Qn (null
  // when the expansion ends: the last convergent is x itself).
  const rows = [];
  let p = P;
  let q = Q;
  let hPrev = 1n;
  let hPrev2 = 0n;
  let kPrev = 0n;
  let kPrev2 = 1n;
  for (let n = 0; n < 64 && q > 0n; n += 1) {
    const a = p / q;
    const h = a * hPrev + hPrev2;
    const k = a * kPrev + kPrev2;
    const r = p - a * q;
    rows.push({ n, a, h, k, kPrev, xNext: r > 0n ? [q, r] : null });
    hPrev2 = hPrev;
    hPrev = h;
    kPrev2 = kPrev;
    kPrev = k;
    p = q;
    q = r;
  }
  return rows;
}
let checked = 0;
let identityFail = 0;
let thresholdFail = 0;
let ruleFive = 0;
let ruleFiveOk = 0;
let ruleTwo = 0;
let ruleTwoOk = 0;
let worstPerron = 0;
const ratios = [];
for (let i = 0; i < 500; i += 1) {
  const Q = 1000003n + BigInt(Math.floor(rand() * 1e9));
  const P = Q + BigInt(Math.floor(rand() * 7 * Number(Q)));
  ratios.push([P, Q]);
  const rows = expandExact(P, Q);
  for (const r of rows) {
    if (!r.xNext) continue;
    const [Pn, Qn] = r.xNext;
    const { h, k, kPrev } = r;
    // direct = 2 h k |h - k x| / (h + k x) with x = P/Q:
    //        = 2 h k |h Q - k P| / (h Q + k P).
    const dNum = 2n * h * k * abs(h * Q - k * P);
    const dDen = h * Q + k * P;
    // closed = 2 h k / ((h + k x) (x_{n+1} k + k_{n-1})), x_{n+1} = Pn/Qn:
    //        = 2 h k Q Qn / ((h Q + k P) (Pn k + Qn kPrev)).
    const cNum = 2n * h * k * Q * Qn;
    const cDen = (h * Q + k * P) * (Pn * k + Qn * kPrev);
    checked += 1;
    if (dNum * cDen !== cNum * dDen) identityFail += 1;
    // Station iff eta < 1/4 iff 4 dNum < dDen; criterion: x_{n+1} + kPrev/k >
    // 8 / (1 + k x / h) iff (Pn k + Qn kPrev) (h Q + k P) > 8 h Q Qn k ... as
    // integers: (Pn/Qn + kPrev/k) > 8 h Q / (h Q + k P)
    //   iff (Pn k + Qn kPrev) (h Q + k P) > 8 h Q k Qn.
    const station = 4n * dNum < dDen;
    const criterion = (Pn * k + Qn * kPrev) * (h * Q + k * P) > 8n * h * Q * k * Qn;
    if (station !== criterion) thresholdFail += 1;
    const next = rows[r.n + 1];
    if (next) {
      if (next.a >= 5n) {
        ruleFive += 1;
        if (station) ruleFiveOk += 1;
      }
      if (next.a <= 2n) {
        ruleTwo += 1;
        if (!station) ruleTwoOk += 1;
      }
    }
    if (r.n >= 6) {
      // eta / (k |k x - h|) = (2 h k |hQ - kP| / (hQ + kP)) / (k |kP - hQ| / Q)
      //                     = 2 h Q / (h Q + k P).
      const ratio = Number((2n * h * Q * 1000000n) / (h * Q + k * P)) / 1e6;
      worstPerron = Math.max(worstPerron, Math.abs(ratio - 1));
    }
  }
}
gate('closed form = the scan\'s weighted merit at every convergent, exactly', identityFail === 0 && checked > 3000, `${checked} convergents of ${ratios.length} rational ratios, ${identityFail} mismatches`);
gate('Perron: eta_n / (k_n |k_n x - h_n|) -> 1', worstPerron < 2e-3, `worst |ratio - 1| = ${worstPerron.toExponential(1)} past the sixth convergent`);
gate('station iff x_{n+1} + k_{n-1}/k_n > 8/(1 + k_n x/h_n), exactly', thresholdFail === 0, `${checked - thresholdFail} of ${checked} convergents classified`);
gate('a next partial quotient >= 5 guarantees a station', ruleFive > 100 && ruleFiveOk === ruleFive, `${ruleFiveOk} of ${ruleFive}`);
gate('a next partial quotient <= 2 forbids one', ruleTwo > 100 && ruleTwoOk === ruleTwo, `${ruleTwoOk} of ${ruleTwo}`);
const worstId = 0;

// ---------------------------------------------------------- 2. the desert
const PHI = (1 + Math.sqrt(5)) / 2;
const sound = (r) => !r.exact && r.k <= 1e5 && r.xNext <= 1e6;
const golden = expand(PHI, 14).filter(sound).map((r) => ({ n: r.n, eta: direct(PHI, r.h, r.k) }));
const hurwitz = 1 / Math.sqrt(5);
const goldenTail = golden.slice(-4);
gate('golden ratio: every convergent sits outside the fringe regime', golden.every((g) => g.eta > 0.25), `min eta ${Math.min(...golden.map((g) => g.eta)).toFixed(4)} over ${golden.length} convergents`);
gate('golden ratio: the merit tends to Hurwitz\'s 1/sqrt5', goldenTail.every((g) => Math.abs(g.eta - hurwitz) < 2e-3), goldenTail.map((g) => `n=${g.n}: ${g.eta.toFixed(4)}`).join(', ') + ` vs ${hurwitz.toFixed(4)}`);

// ---------------------------------------------------------- 3. named exhibits
const exhibits = [
  { name: '16.4 : 8 = 41 : 20', x: 16.4 / 8 },
  { name: '15 : 5 twisted 2 degrees', x: (15 / 5) * Math.cos((2 * Math.PI) / 180) },
  { name: 'sqrt 2', x: Math.SQRT2 },
  { name: 'e', x: Math.E },
  { name: 'pi', x: Math.PI },
];
for (const ex of exhibits) {
  ex.rows = expand(ex.x, 9)
    .map((r) => ({ n: r.n, h: r.h, k: r.k, aNext: expand(ex.x, 10).find((q) => q.n === r.n + 1)?.a ?? null, eta: r.exact ? 0 : direct(ex.x, r.h, r.k), station: r.exact ? true : direct(ex.x, r.h, r.k) < 0.25 }));
  console.log(`  ${ex.name}: ` + ex.rows.slice(0, 5).map((r) => `${r.h}/${r.k}${r.station ? '*' : ''}(${r.eta.toFixed(3)})`).join('  '));
}
const twoOne = exhibits[0].rows[0];
const silver = exhibits[2].rows[exhibits[2].rows.length - 1];
gate('sqrt 2 is a desert too, at 1/(2 sqrt 2)', Math.abs(silver.eta - 1 / (2 * Math.SQRT2)) < 2e-3 && silver.eta > 0.25, `eta ${silver.eta.toFixed(4)} vs ${(1 / (2 * Math.SQRT2)).toFixed(4)}`);
gate('the 41:20 pair\'s first convergent 2/1 is the station at merit 1/20', twoOne.h === 2 && twoOne.k === 1 && Math.abs(twoOne.eta - 2 * 1 * Math.abs(2 / 2.05 - 1) / (0.5 * (2 / 2.05 + 1))) < 1e-12 && Math.abs(twoOne.eta - 0.05) < 2e-3, `eta ${twoOne.eta.toFixed(4)}`);

const failed = gates.filter((g) => !g.ok);
writeFileSync(OUT, JSON.stringify({ ratios: ratios.length, convergents: checked, identityMismatches: identityFail, worstIdentity: worstId, worstPerron, hurwitz, golden, silver: silver.eta, ruleFive, ruleTwo, exhibits, gates }, null, 1));
console.log(failed.length ? `GATE FAILURE (${failed.length})` : 'all gates pass');
process.exitCode = failed.length ? 1 : 0;
