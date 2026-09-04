// Error against time on the Yang & Barnes benchmark, from data/yb-sweep.json:
// one panel per case, log-log, the count-map hybrid at every budget, Gaussian
// supersampling at 4/16/64/256 samples, and the published points (Yang &
// Barnes, Dorn 2015, their MSAA) where the case has them. Writes
// figures/yb-pareto.svg. Run: node paper/tools/exp/yb-pareto.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const sweep = JSON.parse(readFileSync(new URL('../../data/yb-sweep.json', import.meta.url), 'utf8'));
const OUT = new URL('../../figures/yb-pareto.svg', import.meta.url);

const cases = Object.keys(sweep);
const PW = 300;
const PH = 240;
const ML = 54;
const MB = 40;
const MT = 28;
const MR = 16;
const cols = Math.min(3, cases.length);
const rows = Math.ceil(cases.length / cols);
const W = cols * (PW + ML + MR);
const H = rows * (PH + MT + MB) + 30;

const xmin = 1;
const xmax = 2000;
const ymin = 0.003;
const ymax = 0.3;
const lx = (v) => (Math.log10(v) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin));
const ly = (v) => (Math.log10(v) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin));

const titles = {
  checkerboard: 'checkerboard',
  sinQuadratic: 'quadratic sine',
  circles: 'circles',
  checkerboardRipples: 'checkerboard with ripples',
  sinQuadraticRipples: 'quadratic sine with ripples',
};

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif" font-size="11">
<rect width="${W}" height="${H}" fill="white"/>
<text x="${W / 2}" y="18" text-anchor="middle" font-size="13">RMS error against time relative to the unfiltered shader, 1000-sample truth (Yang &amp; Barnes protocol)</text>
`;

cases.forEach((name, idx) => {
  const c = sweep[name];
  const ox = ML + (idx % cols) * (PW + ML + MR);
  const oy = 30 + MT + Math.floor(idx / cols) * (PH + MT + MB);
  const X = (v) => ox + lx(Math.max(xmin, Math.min(xmax, v))) * PW;
  const Y = (v) => oy + PH - ly(Math.max(ymin, Math.min(ymax, v))) * PH;
  svg += `<rect x="${ox}" y="${oy}" width="${PW}" height="${PH}" fill="none" stroke="#999"/>\n`;
  svg += `<text x="${ox + PW / 2}" y="${oy - 8}" text-anchor="middle" font-size="12">${titles[name] || name}</text>\n`;
  for (const t of [1, 10, 100, 1000]) {
    svg += `<line x1="${X(t)}" y1="${oy}" x2="${X(t)}" y2="${oy + PH}" stroke="#eee"/>\n<text x="${X(t)}" y="${oy + PH + 14}" text-anchor="middle">${t}x</text>\n`;
  }
  for (const e of [0.003, 0.01, 0.03, 0.1, 0.3]) {
    svg += `<line x1="${ox}" y1="${Y(e)}" x2="${ox + PW}" y2="${Y(e)}" stroke="#eee"/>\n<text x="${ox - 6}" y="${Y(e) + 4}" text-anchor="end">${e}</text>\n`;
  }
  // noise floor
  svg += `<line x1="${ox}" y1="${Y(c.noiseFloor)}" x2="${ox + PW}" y2="${Y(c.noiseFloor)}" stroke="#b33" stroke-dasharray="4 3"/>\n<text x="${ox + PW - 4}" y="${Y(c.noiseFloor) - 4}" text-anchor="end" fill="#b33">noise floor of the truth</text>\n`;
  // msaa curve
  const msaa = c.points.filter((p) => p.kind === 'msaa');
  svg += `<polyline fill="none" stroke="#777" stroke-width="1.5" points="${msaa.map((p) => `${X(p.rel)},${Y(p.err)}`).join(' ')}"/>\n`;
  for (const p of msaa) svg += `<circle cx="${X(p.rel)}" cy="${Y(p.err)}" r="3" fill="#777"/>\n<text x="${X(p.rel) + 5}" y="${Y(p.err) - 4}" fill="#555">${p.label}</text>\n`;
  // ours
  const ours = c.points.filter((p) => p.kind === 'ours').sort((a, b) => a.rel - b.rel);
  svg += `<polyline fill="none" stroke="#1a5fb4" stroke-width="1.5" points="${ours.map((p) => `${X(p.rel)},${Y(p.err)}`).join(' ')}"/>\n`;
  for (const p of ours) svg += `<circle cx="${X(p.rel)}" cy="${Y(p.err)}" r="3.5" fill="#1a5fb4"/>\n`;
  const ex = ours.find((p) => p.label === 'exact');
  if (ex) svg += `<text x="${X(ex.rel) - 6}" y="${Y(ex.err) + 14}" text-anchor="end" fill="#1a5fb4">count-map, exact</text>\n`;
  const cheapest = ours[0];
  if (cheapest && cheapest !== ex) svg += `<text x="${X(cheapest.rel) + 6}" y="${Y(cheapest.err) - 6}" fill="#1a5fb4">count-map hybrid</text>\n`;
  // published
  if (c.published) {
    const pub = [
      { label: 'Yang &amp; Barnes', err: c.published.theirs, rel: c.published.theirsTime, color: '#2a9d3f' },
      { label: 'Dorn 2015', err: c.published.dorn, rel: 1.2, color: '#c27a00' },
      { label: 'their MSAA', err: c.published.msaa, rel: c.published.msaaTime, color: '#777' },
    ];
    for (const p of pub) {
      svg += `<rect x="${X(p.rel) - 4}" y="${Y(p.err) - 4}" width="8" height="8" fill="${p.color}"/>\n<text x="${X(p.rel) + 7}" y="${Y(p.err) + 4}" fill="${p.color}">${p.label} (published)</text>\n`;
    }
  }
});
svg += `<text x="${W / 2}" y="${H - 6}" text-anchor="middle" fill="#555">blue: count-map (exact at the right, the budgeted hybrid toward the left); grey: Gaussian supersampling; squares: published points</text>\n</svg>\n`;
writeFileSync(OUT, svg);
console.log('wrote', OUT.pathname);
