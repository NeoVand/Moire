// The count-map figure of paper 3 (Figure 2): what a count is, what the state
// is, and why the drawing is the picture read at the state.
//
//   node paper/tools/exp/countmap-figs.mjs
//
// Writes paper/figures/countmap-{family,count,frac,pair,composite}.png and
// paper/fig-countmap.tex, which paper/p3-torus.tex inputs. The panels are the
// field library's own counts -- the same index functions the tool and every
// experiment use -- so the figure cannot drift from the theory it illustrates.
import { mkdirSync, writeFileSync } from 'node:fs';
import { family } from '../lib/fields.mjs';
import { view, compose, fieldImage, overlayLevelSets } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
const TEX = new URL('../../fig-countmap.tex', import.meta.url);
mkdirSync(FIGS, { recursive: true });

// The paper's colours (paper3.tex).
const INK = '#15181c';
const RGB = { ink: [0x15, 0x18, 0x1c], cool: [0x1b, 0x6c, 0xa8], warm: [0xd4, 0x76, 0x1a], white: [255, 255, 255] };
const PX = 420; // panel pixels
const ZOOM = 2.1; // world units across = PX / ZOOM = 200
const WORLD = PX / ZOOM;
const V = view({ width: PX, height: PX, zoom: ZOOM, superSample: 3 });
const CM = 4.2; // panel size in the figure, cm
const GAP = 0.45; // gutter between panels, cm
const toCm = (p) => [((p.x + WORLD / 2) / WORLD) * CM, ((p.y + WORLD / 2) / WORLD) * CM];
const frac = (v) => v - Math.floor(v);
const f3 = (v) => v.toFixed(3);

// The families. Family 1: a bent family (wavy lines), so that "irregular
// families have counts too" is in the picture. Family 2: rings about a centre.
const LINES = { kind: 'wave', spacing: 22, bend: 5, frequency: 0.9, thickness: 3, color: INK };
const RINGS = { kind: 'concentric', shape: 'circle', spacing: 20, position: { x: -34, y: -8 }, thickness: 3, color: INK };
const lines = family(LINES);
const rings = family(RINGS);
// Stroke half-widths as fractions of the pitch: the picture's bands.
const d1 = LINES.thickness / 2 / LINES.spacing;
const d2 = RINGS.thickness / 2 / RINGS.spacing;

// (a) the family, as drawn.
const a = compose(V, [LINES]);
writePng(new URL('countmap-family.png', FIGS), a, V.width, V.height);
// (b) its count, with the whole-number level sets, which are the members.
const b = fieldImage(V, (p) => lines.index(p), { name: 'viridis' });
// overlayLevelSets returns a new buffer; the input is left untouched.
const bLines = overlayLevelSets(b.rgb, V, (p) => lines.index(p), { color: RGB.ink, width: 1.5 });
writePng(new URL('countmap-count.png', FIGS), bLines, V.width, V.height);
// (c) the fractional part: a sawtooth that jumps at every member.
const c = fieldImage(V, (p) => lines.index(p), { name: 'viridis', wrap: true });
writePng(new URL('countmap-frac.png', FIGS), c.rgb, V.width, V.height);
// (d) two families over each other, as drawn.
const d = compose(V, [RINGS, LINES]);
writePng(new URL('countmap-pair.png', FIGS), d, V.width, V.height);
// (f) the same drawing computed from the state alone: at every pixel look up
// Phi, then read the picture I -- ink where either fractional count is within
// its stroke's half-width of zero -- in the picture's colours. S = I o Phi.
function composite(ss) {
  const out = new Uint8Array(V.width * V.height * 3);
  for (let y = 0; y < V.height; y++) {
    for (let x = 0; x < V.width; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss - V.width / 2;
          const py = y + (sy + 0.5) / ss - V.height / 2;
          const p = { x: px / V.zoom, y: -py / V.zoom };
          const u1 = frac(lines.index(p));
          const u2 = frac(rings.index(p));
          const in1 = Math.min(u1, 1 - u1) < d1;
          const in2 = Math.min(u2, 1 - u2) < d2;
          const col = in1 && in2 ? RGB.ink : in1 ? RGB.cool : in2 ? RGB.warm : RGB.white;
          for (let k = 0; k < 3; k++) acc[k] += col[k];
        }
      }
      const i = (y * V.width + x) * 3;
      for (let k = 0; k < 3; k++) out[i + k] = Math.round(acc[k] / (ss * ss));
    }
  }
  return out;
}
writePng(new URL('countmap-composite.png', FIGS), composite(3), V.width, V.height);

// Member numbers for (a): where each member crosses a line near the top edge.
const yTop = WORLD / 2 - 6;
const labels = [];
let prev = lines.index({ x: -WORLD / 2, y: yTop });
for (let x = -WORLD / 2 + 0.25; x <= WORLD / 2; x += 0.25) {
  const cur = lines.index({ x, y: yTop });
  if (Math.floor(cur) !== Math.floor(prev)) labels.push({ n: Math.floor(Math.max(cur, prev)), x });
  prev = cur;
}
// Counting from the leftmost visible member as member 0.
const n0 = labels[0].n;

// The point x and its two fractional counts, for (d) and (e).
const X = { x: 41, y: 4 };
const u1 = frac(lines.index(X));
const u2 = frac(rings.index(X));
// The image on the torus of a straight segment through X, wrapped: cut where
// either coordinate jumps across an edge.
const gl = lines.gradVec(X);
const dir = { x: gl.x, y: gl.y }; // along family 1's gradient: both counts advance
const L = 11;
const pieces = [];
let piece = [];
let lastU = null;
for (let t = -L; t <= L; t += 0.25) {
  const p = { x: X.x + dir.x * t, y: X.y + dir.y * t };
  const uu = [frac(lines.index(p)), frac(rings.index(p))];
  if (lastU && (Math.abs(uu[0] - lastU[0]) > 0.5 || Math.abs(uu[1] - lastU[1]) > 0.5)) {
    pieces.push(piece);
    piece = [];
  }
  piece.push(uu);
  lastU = uu;
}
pieces.push(piece);
console.log(`x = (${X.x}, ${X.y}): counts ${lines.index(X).toFixed(3)} and ${rings.index(X).toFixed(3)}, fractional (${u1.toFixed(2)}, ${u2.toFixed(2)})`);
console.log(`members labelled at the top edge: ${labels.map((l) => (l.n - n0) + '@' + l.x.toFixed(0)).join(' ')}`);
console.log(`torus path in ${pieces.length} pieces`);

const T = CM; // torus panel size, cm: the same as the other panels
const [xcm, ycm] = toCm(X);
const arrowTo = toCm({ x: X.x + dir.x * L, y: X.y + dir.y * L });
const arrowFrom = toCm({ x: X.x - dir.x * L, y: X.y - dir.y * L });
const col = (i) => i * (CM + GAP);
const panel = (i, file) => `  \\node[anchor=south west, inner sep=0] at (${f3(col(i))},0) {\\includegraphics[width=${CM}cm]{${file}}};\n  \\draw[soft] (${f3(col(i))},0) rectangle (${f3(col(i) + CM)},${CM});`;
const sub = (i, y, text) => `  \\node[anchor=north, align=center, text width=${CM}cm] at (${f3(col(i) + CM / 2)},${f3(y)}) {${text}};`;

const tex = `% GENERATED by paper/tools/exp/countmap-figs.mjs -- do not edit by hand.
\\begin{tikzpicture}[x=1cm, y=1cm, font=\\scriptsize, >={Stealth[length=3pt]}]
  % Row 1: one family, its count, its fractional part.
${panel(0, 'countmap-family.png')}
${panel(1, 'countmap-count.png')}
${panel(2, 'countmap-frac.png')}
${labels
  .map((l) => {
    const [lx] = toCm({ x: l.x, y: 0 });
    return `  \\node[accent, fill=white, inner sep=0.6pt] at (${f3(lx)},${f3(CM - 0.2)}) {${l.n - n0}};`;
  })
  .join('\n')}
${sub(0, -0.08, '(a) a family, members numbered')}
${sub(1, -0.08, '(b) its count $\\xi(x)$, a function on the plane; the members are its whole-number level sets')}
${sub(2, -0.08, '(c) where you are in the member: $\\xi\\bmod1$, a ramp that jumps at each member')}
  % Row 2: two families read at one point, the state on the torus, the drawing recomputed from the state.
  \\begin{scope}[shift={(0,-${CM + 1.7})}]
${panel(0, 'countmap-pair.png')}
    \\draw[accent, ->, line width=0.7pt] (${f3(arrowFrom[0])},${f3(arrowFrom[1])}) -- (${f3(arrowTo[0])},${f3(arrowTo[1])});
    \\fill[accent] (${f3(xcm)},${f3(ycm)}) circle (1.6pt);
    \\node[accent, anchor=south west, fill=white, inner sep=1pt] at (${f3(xcm + 0.08)},${f3(ycm + 0.08)}) {$x$};
${sub(0, -0.3, `(d) two families, drawn. At $x$: $\\xi_1=${lines.index(X).toFixed(2)}$, $\\xi_2=${rings.index(X).toFixed(2)}$; a short step along the arrow advances both`)}
    % The torus: the unit square with its edges glued, the picture, the state, the path.
    \\begin{scope}[shift={(${f3(col(1))},0)}]
      % The picture I: family 1's stroke is a vertical band about u1 = 0 (blue), family 2's a horizontal band about u2 = 0 (orange).
      \\fill[cool!45] (0,0) rectangle (${f3(d1 * T)},${T});
      \\fill[cool!45] (${f3((1 - d1) * T)},0) rectangle (${T},${T});
      \\fill[warm!45] (0,0) rectangle (${T},${f3(d2 * T)});
      \\fill[warm!45] (0,${f3((1 - d2) * T)}) rectangle (${T},${T});
      \\foreach \\ax/\\bx in {0/${f3(d1 * T)}, ${f3((1 - d1) * T)}/${T}} { \\foreach \\ay/\\by in {0/${f3(d2 * T)}, ${f3((1 - d2) * T)}/${T}} { \\fill[ink!45] (\\ax,\\ay) rectangle (\\bx,\\by); } }
      % Level lines of the slow recipe (1,-1), faint, clipped to the square.
      \\begin{scope}
        \\clip (0,0) rectangle (${T},${T});
        \\foreach \\c in {-0.8,-0.6,...,0.81} { \\draw[accent!35, thin] (\\c*${T},0) -- (\\c*${T}+${T},${T}); }
      \\end{scope}
      \\draw[ink] (0,0) rectangle (${T},${T});
      % Gluing arrows: single on left and right, double on top and bottom.
      \\draw[ink, ->] (0,${f3(T * 0.45)}) -- (0,${f3(T * 0.55)});
      \\draw[ink, ->] (${T},${f3(T * 0.45)}) -- (${T},${f3(T * 0.55)});
      \\draw[ink, ->] (${f3(T * 0.43)},0) -- (${f3(T * 0.53)},0);
      \\draw[ink, ->] (${f3(T * 0.43)},${T}) -- (${f3(T * 0.53)},${T});
      \\draw[ink, ->] (${f3(T * 0.47)},0) -- (${f3(T * 0.57)},0);
      \\draw[ink, ->] (${f3(T * 0.47)},${T}) -- (${f3(T * 0.57)},${T});
      % The path of the segment through x.
${pieces
  .map((pc) => `      \\draw[accent, line width=1.1pt] ${pc.map((uu) => `(${f3(uu[0] * T)},${f3(uu[1] * T)})`).join(' -- ')};`)
  .join('\n')}
      \\fill[accent] (${f3(u1 * T)},${f3(u2 * T)}) circle (1.8pt);
      \\node[accent, anchor=south east, fill=white, inner sep=1pt] at (${f3(u1 * T - 0.06)},${f3(u2 * T + 0.06)}) {$\\Phi(x)=(${u1.toFixed(2)},${u2.toFixed(2)})$};
      \\node[anchor=north, font=\\tiny] at (${T / 2},-0.03) {$\\xi_1\\bmod1$};
      \\node[anchor=south, rotate=90, font=\\tiny] at (-0.03,${T / 2}) {$\\xi_2\\bmod1$};
    \\end{scope}
${sub(1, -0.3, '(e) the state $\\Phi(x)=(\\xi_1,\\xi_2)\\bmod1$ on the torus: the square with its edges glued (arrows). Blue: states where the lines have ink; orange: the rings. Red: the image of the arrow in (d). Faint: $\\xi_1-\\xi_2$ constant')}
${panel(2, 'countmap-composite.png')}
${sub(2, -0.3, '(f) the drawing computed from the state alone: at every pixel look up $\\Phi$, then read the picture in (e). It is (d) again: $S=I\\circ\\Phi$')}
  \\end{scope}
\\end{tikzpicture}
`;
writeFileSync(TEX, tex);
console.log('wrote fig-countmap.tex');
