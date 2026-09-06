// The decay of Beurling's function's excess over the sign away from the origin, for the localized
// excess bound of the Selberg majorant (bridge #292, #293): B(x) - sgn(x) is sampled between the
// integers (it vanishes at them) and compared with 1 / (pi x)^2; the maximum of (B - sgn) x^2 over
// [1, 60] is reported on each side. Numerical evidence for a skirt bound, not its proof.
const NT = 200000;
const B = (x) => { if (Number.isInteger(x)) return x >= 0 ? 1 : -1; const s = Math.sin(Math.PI * x) / Math.PI; let sum = 2 / x; for (let n = 0; n <= NT; n++) sum += 1 / ((x - n) * (x - n)); for (let n = 1; n <= NT; n++) sum -= 1 / ((x + n) * (x + n)); return s * s * sum; };
for (const x of [2.5, 5.5, 10.5, 20.5, 40.5]) { const g = B(x) - 1, gn = B(-x) + 1; console.log(`x ${x}: (B - sgn)(x) ${g.toExponential(3)}, times (pi x)^2 ${(g * Math.PI * Math.PI * x * x).toFixed(4)}; (B - sgn)(-x) ${gn.toExponential(3)}, times (pi x)^2 ${(gn * Math.PI * Math.PI * x * x).toFixed(4)}`); }
let mp = 0, mn = 0; for (let i = 1000; i <= 60000; i++) { const x = i / 1000; mp = Math.max(mp, (B(x) - 1) * x * x); mn = Math.max(mn, (B(-x) + 1) * x * x); }
console.log(`max over [1, 60] of (B - sgn) x^2: positive side ${mp.toFixed(4)}, negative side ${mn.toFixed(4)}; 1 / pi^2 = ${(1 / (Math.PI * Math.PI)).toFixed(4)}`);
