// Adaptive bracket mesh: every cell at side h_S (level L_S), cells meeting the jump curve refined to h_J (level L_J), affine brackets on the
// cells inside the disc (gap h^2 / 2 per unit area), [0, 1] on the finest cells meeting the circle, [0, 0] outside. Same material and query as
// bracket-acquisition.mjs. Prints terminal cells and gap_W against the count bound (2R / h_S)^2 + 32 l_J / h_J + 16 N_J (L_J - L_S) and the
// gap bound 8 kappa_2 R^2 h_S^2 + 8 l_J h_J + 4 N_J h_J^2 with kappa_2 = 1/4, and the uniform mesh at level L_J for comparison. Ordinary doubles.
const R = 3, c = [0.4, -0.2], r = 1.7, Qs = 0.5, L = Math.hypot(0.5, -0.3), lJ = 2 * Math.PI * r, kappa2 = 0.25;
function cellClass(x0, x1, y0, y1) { const dx = Math.max(x0 - c[0], 0, c[0] - x1), dy = Math.max(y0 - c[1], 0, c[1] - y1); const dmin = Math.hypot(dx, dy);
  const dmax = Math.hypot(Math.max(Math.abs(x0 - c[0]), Math.abs(x1 - c[0])), Math.max(Math.abs(y0 - c[1]), Math.abs(y1 - c[1]))); return dmax <= r ? 'in' : (dmin > r ? 'out' : 'J'); }
function mesh(LS, LJ) { let cells = 0, gap = 0;
  const visit = (x0, y0, h, lev) => { const k = cellClass(x0, x0 + h, y0, y0 + h);
    if (k === 'J' && lev < LJ) { const h2 = h / 2; visit(x0, y0, h2, lev + 1); visit(x0 + h2, y0, h2, lev + 1); visit(x0, y0 + h2, h2, lev + 1); visit(x0 + h2, y0 + h2, h2, lev + 1); return; }
    cells++; if (k === 'J') gap += h * h; else if (k === 'in') gap += (h * h / 2) * h * h; };
  const n = 2 ** LS, h = 2 * R / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) visit(-R + i * h, -R + j * h, h, LS);
  return { cells, gap };
}
const bound = g => g / (2 * Math.PI * Qs) + Math.exp(-((R - L) ** 2) / (2 * Qs));
console.log('L_S L_J | terminal cells, count bound | gap_W, gap bound | query bound || uniform at L_J: cells, gap_W, query bound');
for (const [LS, LJ] of [[4, 7], [4, 9], [5, 9], [5, 11], [6, 11], [6, 13]]) {
  const hS = 2 * R / 2 ** LS, hJ = 2 * R / 2 ** LJ; const a = mesh(LS, LJ), u = mesh(LJ, LJ);
  const cb = (2 * R / hS) ** 2 + 32 * lJ / hJ + 16 * (LJ - LS), gb = 8 * kappa2 * R * R * hS * hS + 8 * lJ * hJ + 4 * hJ * hJ;
  console.log(`${LS} ${LJ} | ${a.cells} ${cb.toFixed(0)} | ${a.gap.toFixed(5)} ${gb.toFixed(5)} | ${bound(a.gap).toFixed(5)} || ${u.cells} ${u.gap.toFixed(5)} ${bound(u.gap).toFixed(5)}`);
}
