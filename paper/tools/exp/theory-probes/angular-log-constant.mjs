// The annulus angular integral of the background-background class: I(d1, d2, psi) = int_0^{2 pi} 1[|sin phi| >= d1, |sin(phi + psi)| >= d2] dphi / (|sin phi| |sin(phi + psi)|).
// Closed form by cot phi - cot(phi + psi) = sin psi / (sin phi sin(phi + psi)) on each of the four arcs: I = (4 / sin psi) [log(1/d1) + log(1/d2) + 2 log sin psi] + o(1) as d -> 0.
// Prints the numeric integral, the closed form, and the implied constant c = (I sin psi / 4) - log(1/d1) - log(1/d2) against 2 log sin psi.
for (const deg of [20, 45, 70, 90]) {
  const psi = deg * Math.PI / 180;
  for (const [d1, d2] of [[0.1, 0.1], [0.02, 0.02], [0.005, 0.005], [0.02, 0.005], [0.001, 0.001]]) {
    const N = 4000000; let s = 0; const h = 2 * Math.PI / N;
    for (let i = 0; i < N; i++) { const phi = (i + 0.5) * h; const a = Math.abs(Math.sin(phi)), b = Math.abs(Math.sin(phi + psi)); if (a >= d1 && b >= d2) s += 1 / (a * b); }
    s *= h;
    const closed = (4 / Math.sin(psi)) * (Math.log(1 / d1) + Math.log(1 / d2) + 2 * Math.log(Math.sin(psi)));
    const c = s * Math.sin(psi) / 4 - Math.log(1 / d1) - Math.log(1 / d2);
    console.log(`psi ${deg} d1 ${d1} d2 ${d2}: integral ${s.toFixed(4)} closed form ${closed.toFixed(4)} implied c ${c.toFixed(4)} vs 2 log sin psi ${(2 * Math.log(Math.sin(psi))).toFixed(4)}`);
  }
}
