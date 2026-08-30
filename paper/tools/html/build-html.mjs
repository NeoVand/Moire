// The paper, migrated to HTML.
//
// A bespoke LaTeX-to-HTML converter for this one paper: it flattens the tex
// sources, expands the paper's own macros, compiles every tikzpicture through
// tectonic as a standalone (cached by content hash), converts floats, tables,
// theorems and the algorithm, numbers everything the way LaTeX numbers it,
// resolves refs and cites, and writes a single readable page with KaTeX for
// the mathematics. Generic LaTeX is out of scope on purpose; this paper's
// LaTeX is disciplined, and a converter that owns every construct it meets is
// smaller than a general one.
//
//   node paper/tools/html/build-html.mjs
//
// Output: public/paper/index.html plus copied figures.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAPER = join(HERE, '..', '..');
const ROOT = join(PAPER, '..');
const OUT = join(ROOT, 'public', 'paper');
const OUT_FIGS = join(OUT, 'figures');
const TIKZ_CACHE = join(PAPER, '.build', 'tikz-html');
mkdirSync(OUT_FIGS, { recursive: true });
mkdirSync(TIKZ_CACHE, { recursive: true });
// Hash-named tikz output goes stale whenever a picture or its width changes.
for (const f of readdirSync(OUT_FIGS)) if (f.startsWith('tikz-')) rmSync(join(OUT_FIGS, f));

const read = (f) => readFileSync(join(PAPER, f), 'utf8');

// ---------------------------------------------------------------- tex reading

function stripComments(tex) {
  // % to end of line, unless escaped. Keeps the newline.
  return tex.replace(/(^|[^\\])%[^\n]*/g, '$1');
}

let src = stripComments(read('paper.tex'));
while (/\\input\{[^}]+\}/.test(src)) {
  src = src.replace(/\\input\{([^}]+)\}/g, (_, name) => stripComments(read(`${name}.tex`)));
}

const preamble = src.slice(0, src.indexOf('\\begin{document}'));
let body = src.slice(src.indexOf('\\begin{document}'), src.indexOf('\\end{document}'));

// ------------------------------------------------------------------- macros

// Zero-argument \newcommand bodies. The numeric macros from numbers.tex are
// pure literals and get expanded everywhere, including inside math; the
// symbolic math macros are handed to KaTeX instead.
const MATH_MACROS = {
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Rot': '\\mathbf{R}_{#1}',
  '\\rad': '\\rho',
  '\\idx': '\\phi',
  '\\ph': '\\psi',
  '\\het': '\\eta',
};

const textMacros = new Map();
for (const m of preamble.matchAll(/\\newcommand\{\\([A-Za-z]+)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
  const [, name, bodyTex] = m;
  if (`\\${name}` in MATH_MACROS) continue;
  if (['figlead', 'panelrow', 'pslash', 'Moire', 'ours', 'sweep', 'loose'].includes(name)) continue;
  if (bodyTex.includes('#')) continue;
  textMacros.set(name, bodyTex);
}

function expandLiteralMacros(tex) {
  const names = [...textMacros.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    tex = tex.replaceAll(new RegExp(`\\\\${name}(?![A-Za-z])`, 'g'), textMacros.get(name));
  }
  tex = tex.replaceAll(/\\Moire\{\}|\\Moire(?![A-Za-z])/g, '@@SC|Moiré@@');
  tex = tex.replaceAll(/\\ours\{\}|\\ours(?![A-Za-z])/g, '@@SC|Window@@');
  tex = tex.replaceAll(/\\sweep\{\}|\\sweep(?![A-Za-z])/g, '@@SC|Sweep@@');
  tex = tex.replaceAll(/\\loose\{\}|\\loose(?![A-Za-z])/g, '@@SC|Loose@@');
  tex = tex.replaceAll(/\\pslash(?![A-Za-z])/g, '/');
  return tex;
}

body = expandLiteralMacros(body);

// -------------------------------------------------------------- small tools

/** Content of a balanced {...} group starting at tex[open] === '{'. */
function balanced(tex, open) {
  let depth = 0;
  for (let i = open; i < tex.length; i++) {
    if (tex[i] === '{' && tex[i - 1] !== '\\') depth++;
    if (tex[i] === '}' && tex[i - 1] !== '\\') {
      depth--;
      if (depth === 0) return { content: tex.slice(open + 1, i), end: i + 1 };
    }
  }
  throw new Error(`unbalanced group at ${tex.slice(open, open + 60)}`);
}

/** First \command{...} in tex; returns {content, before, after} or null. */
function takeCommand(tex, command) {
  const at = tex.indexOf(`\\${command}{`);
  if (at < 0) return null;
  const grp = balanced(tex, at + command.length + 1);
  return { content: grp.content, before: tex.slice(0, at), after: tex.slice(grp.end) };
}

function extractEnv(tex, env, from = 0) {
  const open = `\\begin{${env}}`;
  const close = `\\end{${env}}`;
  const at = tex.indexOf(open, from);
  if (at < 0) return null;
  let depth = 0;
  let i = at;
  while (i < tex.length) {
    if (tex.startsWith(open, i)) {
      depth++;
      i += open.length;
    } else if (tex.startsWith(close, i)) {
      depth--;
      i += close.length;
      if (depth === 0) {
        const inner = tex.slice(at + open.length, i - close.length);
        return { start: at, end: i, inner };
      }
    } else i++;
  }
  throw new Error(`unclosed environment ${env}`);
}

// ------------------------------------------------------------ tikz pipeline

const TIKZ_PREAMBLE = `\\documentclass[tikz]{standalone}
\\usepackage{amsmath}\\usepackage{amssymb}
\\usepackage{pgfplots}\\usepackage{pgfplotstable}
\\pgfplotsset{compat=1.18}
\\usetikzlibrary{calc, arrows.meta, decorations.pathreplacing, patterns, positioning, fit}
\\definecolor{ink}{HTML}{15181C}\\definecolor{accent}{HTML}{C81E5A}
\\definecolor{cool}{HTML}{1B6CA8}\\definecolor{warm}{HTML}{D4761A}
\\definecolor{soft}{HTML}{8A94A0}\\definecolor{paperbg}{HTML}{F7F7F5}
\\newcommand{\\rad}{\\rho}\\newcommand{\\idx}{\\phi}\\newcommand{\\ph}{\\psi}\\newcommand{\\het}{\\eta}
\\newcommand{\\R}{\\mathbb{R}}\\newcommand{\\Z}{\\mathbb{Z}}\\newcommand{\\Rot}[1]{\\mathbf{R}_{#1}}
\\pgfplotsset{
  paperaxis/.style={
    width=\\linewidth, height=4.4cm,
    tick align=outside, tick pos=left,
    axis line style={gray!60},
    grid=major, grid style={gray!18, very thin},
    label style={font=\\small}, tick label style={font=\\footnotesize},
    legend style={font=\\footnotesize, draw=gray!40, fill=white, fill opacity=0.92,
                  text opacity=1, inner sep=2pt, row sep=-1pt},
  },
  smallaxis/.style={paperaxis, height=3.6cm},
}
\\begin{document}
`;

// acmtog's line width, measured: everything in the paper is drawn against it.
const LINEWIDTH_PT = 510.295;

// acmtog is two-column past \maketitle: a plain figure float is one column
// wide, a starred one spans the full line.
const COLUMNWIDTH_PT = 243.147;
let tikzCount = 0;
function compileTikz(tikzTex, widthPt = LINEWIDTH_PT) {
  tikzCount += 1;
  // \linewidth inside the picture means the width the figure had in print:
  // the full column for a bare figure, a fraction of it inside a subfigure.
  // CSV tables resolve against the document directory, so point them at the
  // paper's data/ absolutely.
  let absTex = tikzTex.replaceAll('{data/', `{${PAPER}/data/`).replaceAll('{figures/', `{${PAPER}/figures/`);
  const doc = `${TIKZ_PREAMBLE}\\setlength{\\linewidth}{${widthPt.toFixed(3)}pt}\n${absTex}\n\\end{document}\n`;
  const hash = createHash('sha256').update(doc).digest('hex').slice(0, 12);
  const png = `tikz-${hash}.png`;
  const cached = join(TIKZ_CACHE, png);
  if (!existsSync(cached)) {
    const texFile = join(TIKZ_CACHE, `tikz-${hash}.tex`);
    writeFileSync(texFile, doc);
    execFileSync('tectonic', ['-X', 'compile', texFile, '--outdir', TIKZ_CACHE], {
      cwd: PAPER,
      stdio: 'pipe',
    });
    execFileSync('pdftocairo', ['-png', '-transp', '-r', '300', '-singlefile', join(TIKZ_CACHE, `tikz-${hash}.pdf`), join(TIKZ_CACHE, `tikz-${hash}`)], { stdio: 'pipe' });
  }
  cpSync(cached, join(OUT_FIGS, png));
  // Display share of the text column that matches the print proportion:
  // pixel width at 300dpi back to points, against the print line width.
  recordDims(`figures/${png}`, cached);
  const pxWidth = readFileSync(cached).readUInt32BE(16);
  return { src: `figures/${png}`, widthPt: (pxWidth / 300) * 72 };
}

// ------------------------------------------------------------ the algorithm

function algorithmicToHtml(tex) {
  tex = tex.replace(/^\s*\[\d+\]/, '');
  const lines = [];
  let indent = 0;
  const flush = (html, kind = '') =>
    lines.push(`<div class="alg-line ${kind}" style="padding-left:${indent * 1.4}em">${html}</div>`);
  for (let raw of tex.split('\n')) {
    raw = raw.trim();
    if (!raw || raw.startsWith('\\begin{algorithmic}') || raw.startsWith('\\end{algorithmic}')) continue;
    let comment = '';
    const cm = raw.match(/\\Comment\{/);
    if (cm) {
      const grp = balanced(raw, raw.indexOf('{', cm.index));
      comment = `<span class="alg-comment">▷ ${inline(grp.content)}</span>`;
      raw = raw.slice(0, cm.index).trim();
    }
    if (raw.startsWith('\\State')) {
      let stmt = raw.slice(6).trim();
      if (stmt.startsWith('\\Return')) stmt = `@@RET@@ ${stmt.slice(7).trim()}`;
      flush(`${inline(stmt)} ${comment}`);
    }
    else if (raw.startsWith('\\For{')) {
      const grp = balanced(raw, 4);
      flush(`<strong>for</strong> ${inline(grp.content)} <strong>do</strong> ${comment}`, 'alg-kw');
      indent++;
    } else if (raw.startsWith('\\If{')) {
      const grp = balanced(raw, 3);
      flush(`<strong>if</strong> ${inline(grp.content)} <strong>then</strong> ${comment}`, 'alg-kw');
      indent++;
    } else if (raw.startsWith('\\EndFor') || raw.startsWith('\\EndIf')) {
      indent = Math.max(0, indent - 1);
    } else if (raw.startsWith('\\Return')) flush(`<strong>return</strong> ${inline(raw.slice(7).trim())} ${comment}`);
    else if (raw) flush(`${inline(raw)} ${comment}`);
  }
  return `<div class="algorithm-body">${lines.join('\n')}</div>`;
}

// ------------------------------------------------------------------ tables

function tabularToHtml(inner) {
  // Drop the column spec argument.
  const specEnd = balanced(inner, inner.indexOf('{'));
  let rowsTex = inner.slice(specEnd.end);
  rowsTex = rowsTex
    .replaceAll(/\\toprule|\\bottomrule/g, '')
    .replaceAll(/\\cmidrule\([lr]*\)\{[^}]*\}/g, '');
  const rows = rowsTex.split('\\\\').map((r) => r.trim()).filter((r) => r.length);
  let html = '<table>';
  let headerDone = false;
  for (let row of rows) {
    let rule = false;
    if (row.includes('\\midrule')) {
      row = row.replaceAll('\\midrule', '').trim();
      rule = true;
    }
    if (!row) continue;
    const cells = row.split(/(?<!\\)&/).map((c) => c.trim());
    const tag = headerDone ? 'td' : 'th';
    const tds = cells
      .map((cell) => {
        const mc = cell.match(/^\\multicolumn\{(\d+)\}\{[^}]*\}\{/);
        if (mc) {
          const grp = balanced(cell, cell.indexOf('{', cell.indexOf('{', cell.indexOf('{') + 1) + 1));
          return `<${tag} colspan="${mc[1]}" class="center">${inline(grp.content)}</${tag}>`;
        }
        return `<${tag}>${inline(cell)}</${tag}>`;
      })
      .join('');
    html += `<tr${rule && headerDone ? ' class="rule-above"' : ''}>${tds}</tr>`;
    if (rule && !headerDone) headerDone = true;
  }
  return `${html}</table>`;
}

// --------------------------------------------------------------- numbering

const labels = new Map(); // label -> { kind, num, id }
let figN = 0;
let tabN = 0;
let eqN = 0;
let thmN = 0;
let secN = 0;
let subN = 0;
let inAppendix = false;
let appendixSecN = 0;

function registerLabel(label, kind, num, id) {
  if (label) labels.set(label, { kind, num, id });
}

// ------------------------------------------------------------------ floats

const floats = [];

function figureToHtml(inner, star, num, id) {
  let tex = inner.replace(/\\centering|\\hfill|\\vspace\{[^}]*\}%?/g, '');
  tex = tex.replace(/\\label\{[^}]+\}/g, '');
  const desc = takeCommand(tex, 'Description');
  if (desc) tex = desc.before + desc.after;

  // Panel label rows.
  const panelRows = [];
  tex = tex.replace(/\\panelrow\{[^}]*\}\{[^}]*\}\{/g, (m, at) => m);
  let pr;
  while ((pr = tex.match(/\\panelrow\{([^}]*)\}\{([^}]*)\}\{/))) {
    const grp = balanced(tex, pr.index + pr[0].length - 1);
    // Split on top-level commas only; a {brace-protected, label} stays whole.
    const parts = [];
    let depth = 0;
    let cur = '';
    let prev = '';
    for (const ch of grp.content) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (ch === ',' && depth === 0 && prev !== '\\') {
        parts.push(cur);
        cur = '';
      } else cur += ch;
      prev = ch;
    }
    parts.push(cur);
    panelRows.push(parts.map((s) => inline(s.trim().replace(/^\{([\s\S]*)\}$/, '$1'))));
    tex = tex.slice(0, pr.index) + `@@PANELROW${panelRows.length - 1}@@` + tex.slice(grp.end);
  }

  // Subfigures. Widths become flex ratios; a subfigure can hold a
  // tikzpicture instead of an image.
  const subs = [];
  let se;
  while ((se = extractEnv(tex, 'subfigure'))) {
    let stex = se.inner.replace(/^\s*\[[^\]]*\]/, '');
    const widthArg = stex.match(/^\s*\{([\d.]+)\\(textwidth|linewidth)\}/);
    const width = widthArg ? Number(widthArg[1]) : 1;
    const widthBase = widthArg && widthArg[2] === 'linewidth' && !star ? COLUMNWIDTH_PT : LINEWIDTH_PT;
    stex = stex.replace(/^\s*\{[^}]*\}/, '');
    const scap = takeCommand(stex, 'caption');
    const scapTex = scap ? scap.content : '';
    if (scap) stex = scap.before + scap.after;
    let img = null;
    const ig = stex.match(/\\includegraphics\[[^\]]*\]\{([^}]+)\}/);
    if (ig) img = copyFigure(ig[1]);
    else {
      const st = extractEnv(stex, 'tikzpicture');
      if (st) img = compileTikz(stex.slice(st.start, st.end), width * widthBase).src;
    }
    subs.push({ img, caption: scapTex, width });
    tex = tex.slice(0, se.start) + tex.slice(se.end);
  }

  // The figure's own caption -- read only after subfigure captions are gone.
  const cap = takeCommand(tex, 'caption');
  const captionTex = cap ? cap.content : '';
  if (cap) tex = cap.before + cap.after;

  // Tikz.
  let tikzHtml = '';
  let te;
  while ((te = extractEnv(tex, 'tikzpicture'))) {
    const { src, widthPt } = compileTikz(tex.slice(te.start, te.end), star ? LINEWIDTH_PT : COLUMNWIDTH_PT);
    // A column-float plot spans the text column, like it spans its column in
    // print; only an intrinsically narrow drawing sits below full width.
    const pct = Math.min(100, Math.max((widthPt / COLUMNWIDTH_PT) * 100, 55));
    tikzHtml += `<img class="tikz" style="width:${pct.toFixed(1)}%" src="${src}" alt="">`;
    tex = tex.slice(0, te.start) + tex.slice(te.end);
  }

  // Plain images.
  const imgs = [...tex.matchAll(/\\includegraphics\[[^\]]*\]\{([^}]+)\}/g)].map((m) => m[1]);

  let bodyHtml = '';
  const allPlots = subs.length > 0 && subs.every((x) => x.img && x.img.includes('tikz-'));
  if (allPlots) star = false;
  if (subs.length) {
    const letters = 'abcdefghij';
    bodyHtml = `<div class="subrow">${subs
      .map(
        (s, i) =>
          `<figure class="sub" style="flex-grow:${s.width}">${s.img ? `<img src="${s.img}" alt="">` : ''}<figcaption>(${letters[i]}) ${inline(s.caption)}</figcaption></figure>`
      )
      .join('')}</div>`;
  }
  for (const [i, img] of imgs.entries()) {
    bodyHtml += `<img src="${copyFigure(img)}" alt="">`;
    const at = tex.indexOf(`@@PANELROW`);
    void at;
    if (panelRows[i]) {
      bodyHtml += `<div class="panelrow">${panelRows[i].map((l) => `<span>${l}</span>`).join('')}</div>`;
    }
  }
  bodyHtml += tikzHtml;

  return `<figure class="paper-figure${star ? ' wide' : ''}" id="${id}">${bodyHtml}<figcaption><span class="fignum">Fig. ${num}.</span> ${inline(captionTex)}</figcaption></figure>`;
}

const IMG_DIMS = new Map();

function recordDims(src, file) {
  const buf = readFileSync(file);
  IMG_DIMS.set(src, { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
}

function copyFigure(rel) {
  const base = rel.split('/').pop();
  const from = join(PAPER, rel.endsWith('.png') ? rel : `${rel}.png`);
  const name = base.endsWith('.png') ? base : `${base}.png`;
  cpSync(from, join(OUT_FIGS, name));
  recordDims(`figures/${name}`, from);
  return `figures/${name}`;
}

function tableToHtml(inner, star, num, id) {
  let tex = inner.replace(/\\centering|\\small|\\footnotesize/g, '');
  tex = tex.replace(/\\label\{[^}]+\}/g, '');
  const cap = takeCommand(tex, 'caption');
  const captionTex = cap ? cap.content : '';
  if (cap) tex = cap.before + cap.after;
  const tab = extractEnv(tex, 'tabular');
  const tableHtml = tab ? `<div class="table-scroll">${tabularToHtml(tab.inner)}</div>` : '';
  return `<figure class="paper-table${star ? ' wide' : ''}" id="${id}"><figcaption><span class="fignum">Table ${num}.</span> ${inline(captionTex)}</figcaption>${tableHtml}</figure>`;
}

function algorithmToHtml(inner, num, id) {
  let tex = inner.replace(/\\label\{[^}]+\}/g, '');
  const cap = takeCommand(tex, 'caption');
  const captionTex = cap ? cap.content : '';
  if (cap) tex = cap.before + cap.after;
  const algi = extractEnv(tex, 'algorithmic');
  return `<figure class="algorithm" id="${id}"><figcaption><span class="fignum">Algorithm ${num}.</span> ${inline(captionTex)}</figcaption>${algorithmicToHtml(algi.inner)}</figure>`;
}

// Pull floats out of the body in document order, registering each label with
// its number now; rendering waits until every label in the paper is known.
const FLOAT_ENVS = ['teaserfigure', 'figure*', 'figure', 'table*', 'table', 'algorithm'];
let algN = 0;
for (;;) {
  let next = null;
  for (const env of FLOAT_ENVS) {
    const e = extractEnv(body, env);
    if (e && (!next || e.start < next.start)) next = { ...e, env };
  }
  if (!next) break;
  let kind;
  let num;
  let id;
  if (next.env === 'algorithm') {
    algN += 1;
    kind = 'Algorithm';
    num = algN;
    id = `alg-${num}`;
  } else if (next.env.startsWith('table')) {
    tabN += 1;
    kind = 'Table';
    num = tabN;
    id = `tab-${num}`;
  } else {
    figN += 1;
    kind = 'Figure';
    num = figN;
    id = `fig-${num}`;
  }
  // Register every label in the float (subfigure labels resolve to the
  // enclosing figure's number, which is where the link should land anyway).
  for (const lm of next.inner.matchAll(/\\label\{([^}]+)\}/g)) registerLabel(lm[1], kind, num, id);
  floats.push({ env: next.env, inner: next.inner, num, id });
  body = `${body.slice(0, next.start)}\n\n@@FLOAT${floats.length - 1}@@\n\n${body.slice(next.end)}`;
}

function renderFloat({ env, inner, num, id }) {
  if (env === 'algorithm') return algorithmToHtml(inner, num, id);
  if (env.startsWith('table')) return tableToHtml(inner, env.endsWith('*'), num, id);
  return figureToHtml(inner, env !== 'figure', num, id);
}

// ----------------------------------------------------------- bibliography

function parseBib(bibText) {
  const entries = [];
  const rx = /@(\w+)\s*\{\s*([^,]+),/g;
  let m;
  while ((m = rx.exec(bibText))) {
    const start = m.index;
    let depth = 0;
    let i = bibText.indexOf('{', start);
    let end = i;
    for (; i < bibText.length; i++) {
      if (bibText[i] === '{') depth++;
      if (bibText[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const bodyText = bibText.slice(start, end + 1);
    const field = (name) => {
      const fm = bodyText.match(new RegExp(`${name}\\s*=\\s*[{"]`, 'i'));
      if (!fm) return '';
      const open = bodyText.indexOf(bodyText[fm.index + fm[0].length - 1] === '{' ? '{' : '"', fm.index + fm[0].length - 1);
      if (bodyText[open] === '{') {
        const grp = balanced(bodyText, open);
        return grp.content;
      }
      return bodyText.slice(open + 1, bodyText.indexOf('"', open + 1));
    };
    entries.push({
      key: m[2].trim(),
      type: m[1].toLowerCase(),
      author: field('author'),
      title: field('title'),
      year: field('year'),
      journal: field('journal'),
      booktitle: field('booktitle'),
      publisher: field('publisher'),
      volume: field('volume'),
      number: field('number'),
      pages: field('pages'),
      doi: field('doi'),
      url: field('url'),
      note: field('note'),
      howpublished: field('howpublished'),
    });
  }
  return entries;
}

const cleanTexText = (s) =>
  s
    .replaceAll(/\\url\{([^}]*)\}/g, '$1')
    .replaceAll(/\\['`^"~=.]?\{?([a-zA-Z])\}?/g, '$1')
    .replaceAll(/[{}]/g, '')
    .replaceAll('--', '–')
    .replaceAll('\\&', '&amp;')
    .replaceAll('~', ' ')
    .trim();

const bib = parseBib(readFileSync(join(PAPER, 'refs.bib'), 'utf8'));
const citedKeys = new Set([...src.matchAll(/\\cite\{([^}]+)\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim())));
const used = bib.filter((e) => citedKeys.has(e.key));
const surname = (e) => cleanTexText((e.author.split(' and ')[0] || '').split(',')[0]).toLowerCase();
used.sort((a, b) => surname(a).localeCompare(surname(b)) || a.year.localeCompare(b.year));
const citeNum = new Map(used.map((e, i) => [e.key, i + 1]));

function formatAuthors(author) {
  const names = author.split(' and ').map((n) => {
    n = cleanTexText(n);
    if (n.includes(',')) {
      const [last, first] = n.split(',').map((s) => s.trim());
      return `${first} ${last}`;
    }
    return n;
  });
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function formatEntry(e) {
  const venue = cleanTexText(e.journal || e.booktitle || e.publisher || e.howpublished || '');
  const vol = e.volume ? ` ${e.volume}${e.number ? `, ${e.number}` : ''}` : '';
  const pages = e.pages ? `, ${cleanTexText(e.pages)}` : '';
  const doi = e.doi
    ? ` <a href="https://doi.org/${e.doi}">doi:${e.doi}</a>`
    : e.url
      ? ` <a href="${e.url}">${e.url.replace(/^https?:\/\//, '')}</a>`
      : '';
  return `${formatAuthors(e.author)}. ${e.year}. <em>${cleanTexText(e.title)}</em>.${venue ? ` ${venue}${vol}${pages}.` : ''}${doi}`;
}

// ------------------------------------------------------------ inline layer

const escapeHtml = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function inline(tex, alreadyEscaped = false) {
  let s = tex;

  // Keep math intact: temporarily shelter $...$, \(...\), \[...\].
  const mathBits = [];
  s = s.replace(/\$[^$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, (m) => {
    mathBits.push(m);
    return `@@MATH${mathBits.length - 1}@@`;
  });

  // A raw < or > in prose or math would open an HTML tag and swallow the rest
  // of the paragraph; KaTeX reads textContent, so entities are safe for it.
  // Nested calls (the one() helpers below) receive already-escaped text.
  if (!alreadyEscaped) {
    s = s.replaceAll('\\&', '@@AMPESC@@');
    s = escapeHtml(s);
    s = s.replaceAll('@@AMPESC@@', '&amp;');
  }

  // Commands with one argument.
  const one = (name, fn) => {
    let t;
    while ((t = takeCommand(s, name))) s = t.before + fn(t.content) + t.after;
  };
  one('emph', (c) => `<em>${inline(c, true)}</em>`);
  one('textbf', (c) => `<strong>${inline(c, true)}</strong>`);
  one('textit', (c) => `<em>${inline(c, true)}</em>`);
  one('textsc', (c) => `<span class="sc">${inline(c, true)}</span>`);
  one('texttt', (c) => `<code>${inline(c, true)}</code>`);
  one('mbox', (c) => `<span class="nowrap">${inline(c, true)}</span>`);
  one('figlead', (c) => `<strong>${inline(c, true)}</strong> `);
  one('caption', (c) => inline(c, true));

  // Citations.
  s = s.replace(/\\cite\{([^}]+)\}/g, (_, keys) => {
    const nums = keys
      .split(',')
      .map((k) => citeNum.get(k.trim()))
      .filter(Boolean)
      .sort((a, b) => a - b);
    return `<span class="cite">[${nums.map((n) => `<a href="#ref-${n}">${n}</a>`).join(', ')}]</span>`;
  });

  // References.
  const refOf = (label) => labels.get(label);
  s = s.replace(/\\S\\ref\{([^}]+)\}/g, (_, l) => {
    const r = refOf(l);
    return r ? `<a href="#${r.id}">§${r.num}</a>` : `§?`;
  });
  s = s.replace(/(Figure|Fig\.|Table|Theorem|Proposition|Lemma|Corollary|Remark|Definition|Section|Appendix|Algorithm|Eq\.)~\\ref\{([^}]+)\}/g, (_, word, l) => {
    const r = refOf(l);
    return r ? `${word} <a href="#${r.id}">${r.num}</a>` : `${word} ?`;
  });
  s = s.replace(/\\eqref\{([^}]+)\}/g, (_, l) => {
    const r = refOf(l);
    return r ? `(<a href="#${r.id}">${r.num}</a>)` : '(?)';
  });
  s = s.replace(/\\ref\{([^}]+)\}/g, (_, l) => {
    const r = refOf(l);
    return r ? `<a href="#${r.id}">${r.num}</a>` : '?';
  });

  // Typography.
  s = s
    .replaceAll("\\'e", 'é')
    .replaceAll("\\'a", 'á')
    .replaceAll('\\"o', 'ö')
    .replaceAll('\\"u', 'ü')
    .replaceAll('\\c{c}', 'ç')
    .replaceAll('~', ' ')
    .replaceAll('\\,', ' ')
    .replaceAll('\\;', ' ')
    .replaceAll('\\ ', ' ')
    .replaceAll('\\%', '%')
    .replaceAll('\\&', '&amp;')
    .replaceAll('\\#', '#')
    .replaceAll('\\_', '_')
    .replaceAll('``', '“')
    .replaceAll("''", '”')
    .replaceAll('---', ' — ')
    .replaceAll('--', '–')
    .replaceAll('\\textendash', '–')
    .replaceAll('\\dots', '…')
    .replaceAll('\\S\\', '§')
    .replaceAll('\\S', '§')
    .replaceAll('\\noindent', '')
    .replaceAll('\\centering', '')
    .replaceAll(/\\qed\b/g, '<span class="qed">∎</span>')
    .replaceAll(/\\label\{[^}]+\}/g, '')
    .replaceAll('\\quad', ' ')
    .replaceAll(/\\hspace\{[^}]*\}/g, ' ')
    .replaceAll(/\\vspace\{[^}]*\}/g, '')
    .replaceAll(/\\(small|footnotesize|itshape|scriptsize)\b/g, '');

  // Leftover empty groups.
  s = s.replaceAll(/\{\}/g, '');

  // Post-escape tokens for injected HTML.
  s = s.replaceAll(/@@SC\|([^@]+)@@/g, '<span class="sc">$1</span>');
  s = s.replaceAll('@@RET@@', '<strong>return</strong>');

  // Punctuation right after math must not start a line: KaTeX renders an
  // atomic inline, and browsers happily break just before the comma.
  s = s.replace(/(@@MATH\d+@@)([,.;:!?)\]]+)/g, '<span class="nowrap">$1$2</span>');

  // Restore math, entity-escaped for the DOM. A nested inline() call may meet
  // the outer call's placeholders: leave those for the outer restore.
  s = s.replace(/@@MATH(\d+)@@/g, (m, i) =>
    mathBits[Number(i)] === undefined ? m : escapeHtml(mathBits[Number(i)])
  );
  return s.trim();
}

// -------------------------------------------------------------- body walk

// Numbered display environments first: they need labels registered before
// inline() resolves refs, so the body walk happens in two passes -- one to
// register every label with its number, one to emit.

function numberEquations(tex) {
  let out = '';
  let rest = tex;
  for (;;) {
    const eq = extractEnv(rest, 'equation');
    const al = extractEnv(rest, 'align');
    const next = [eq && { ...eq, env: 'equation' }, al && { ...al, env: 'align' }]
      .filter(Boolean)
      .sort((a, b) => a.start - b.start)[0];
    if (!next) break;
    out += rest.slice(0, next.start);
    let inner = next.inner;
    if (next.env === 'equation') {
      eqN += 1;
      const label = inner.match(/\\label\{([^}]+)\}/)?.[1];
      registerLabel(label, 'Equation', eqN, `eq-${eqN}`);
      inner = inner.replace(/\\label\{[^}]+\}/g, '').trim();
      out += `\n\n@@EQ|${eqN}|${Buffer.from(inner).toString('base64')}@@\n\n`;
    } else {
      // Every \\ line of an align gets its own number unless \nonumber.
      const rows = inner.split('\\\\');
      const nums = [];
      const cleaned = rows.map((row) => {
        if (row.includes('\\nonumber')) {
          nums.push(null);
          return row.replaceAll('\\nonumber', '');
        }
        eqN += 1;
        const label = row.match(/\\label\{([^}]+)\}/)?.[1];
        registerLabel(label, 'Equation', eqN, `eq-${eqN}`);
        nums.push(eqN);
        return row.replace(/\\label\{[^}]+\}/g, '');
      });
      out += `\n\n@@ALIGN|${nums.map((n) => n ?? '').join(',')}|${Buffer.from(cleaned.join('\\\\')).toString('base64')}@@\n\n`;
    }
    rest = rest.slice(next.end);
  }
  return out + rest;
}

body = numberEquations(body);

// Lists first, so a list inside a theorem or proof body arrives there as
// placeholders that renderParas can expand. Items travel base64-coded so a
// multi-paragraph item cannot be split by the blank-line walk.
for (const [env, tag] of [['itemize', 'ul'], ['enumerate', 'ol']]) {
  for (;;) {
    const e = extractEnv(body, env);
    if (!e) break;
    const items = e.inner
      .split('\\item')
      .slice(1)
      .map((it) => `@@LI|${Buffer.from(it.trim()).toString('base64')}@@`)
      .join('\n\n');
    body = `${body.slice(0, e.start)}\n\n@@LIST|${tag}@@\n\n${items}\n\n@@ENDLIST|${tag}@@\n\n${body.slice(e.end)}`;
  }
}

// The thesis pull-quote.
for (;;) {
  const e = extractEnv(body, 'quote');
  if (!e) break;
  body = `${body.slice(0, e.start)}\n\n@@QUOTE|${Buffer.from(e.inner.trim()).toString('base64')}@@\n\n${body.slice(e.end)}`;
}

// Theorem-family environments.
const THMS = { theorem: 'Theorem', proposition: 'Proposition', lemma: 'Lemma', corollary: 'Corollary', definition: 'Definition', remark: 'Remark' };
for (;;) {
  let next = null;
  for (const env of Object.keys(THMS)) {
    const e = extractEnv(body, env);
    if (e && (!next || e.start < next.start)) next = { ...e, env };
  }
  if (!next) break;
  thmN += 1;
  let inner = next.inner;
  const optTitle = inner.match(/^\s*\[([^\]]*)\]/);
  if (optTitle) inner = inner.slice(optTitle[0].length);
  const label = inner.match(/\\label\{([^}]+)\}/)?.[1];
  registerLabel(label, THMS[next.env], thmN, `thm-${thmN}`);
  inner = inner.replace(/\\label\{[^}]+\}/g, '');
  const kindClass = next.env === 'remark' || next.env === 'definition' ? 'thm-def' : 'thm-plain';
  const html = `\n\n@@THM|${thmN}|${THMS[next.env]}|${kindClass}|${optTitle ? Buffer.from(optTitle[1]).toString('base64') : ''}|${Buffer.from(inner).toString('base64')}@@\n\n`;
  body = body.slice(0, next.start) + html + body.slice(next.end);
}

// Proof environments.
for (;;) {
  const e = extractEnv(body, 'proof');
  if (!e) break;
  let inner = e.inner;
  const optTitle = inner.match(/^\s*\[([^\]]*)\]/);
  if (optTitle) inner = inner.slice(optTitle[0].length);
  body = `${body.slice(0, e.start)}\n\n@@PROOF|${optTitle ? Buffer.from(optTitle[1]).toString('base64') : ''}|${Buffer.from(inner).toString('base64')}@@\n\n${body.slice(e.end)}`;
}

// Center blocks (inline tabulars in the appendix).
for (;;) {
  const e = extractEnv(body, 'center');
  if (!e) break;
  const tab = extractEnv(e.inner, 'tabular');
  const html = tab
    ? `@@RAW|${Buffer.from(`<div class="table-scroll">${tabularToHtml(tab.inner)}</div>`).toString('base64')}@@`
    : '';
  body = `${body.slice(0, e.start)}\n\n${html}\n\n${body.slice(e.end)}`;
}

// Sections: register labels in document order before emitting.
{
  let scan = body;
  let sN = 0;
  let sSub = 0;
  let app = false;
  let appN = 0;
  const rx = /\\(section|subsection|paragraph)\{|\\appendix\b/g;
  let m;
  const positions = [];
  while ((m = rx.exec(scan))) positions.push({ cmd: m[1] ?? 'appendix', at: m.index });
  for (const { cmd, at } of positions) {
    if (cmd === 'appendix') {
      app = true;
      continue;
    }
    const grp = balanced(scan, scan.indexOf('{', at));
    const after = scan.slice(grp.end, grp.end + 80);
    const label = after.match(/^\s*\\label\{([^}]+)\}/)?.[1];
    if (cmd === 'paragraph') {
      // A labelled lead-in resolves to its enclosing (sub)section number.
      const num = app
        ? sSub ? `${String.fromCharCode(64 + appN)}.${sSub}` : String.fromCharCode(64 + appN)
        : sSub ? `${sN}.${sSub}` : String(sN);
      registerLabel(label, 'Section', num, app && !sSub ? `sec-A${appN}` : `sec-${num.replaceAll('.', '-')}`);
      continue;
    }
    if (cmd === 'section') {
      if (app) {
        appN += 1;
        sSub = 0;
        registerLabel(label, 'Appendix', String.fromCharCode(64 + appN), `sec-A${appN}`);
      } else {
        sN += 1;
        sSub = 0;
        registerLabel(label, 'Section', String(sN), `sec-${sN}`);
      }
    } else {
      sSub += 1;
      const num = app ? `${String.fromCharCode(64 + appN)}.${sSub}` : `${sN}.${sSub}`;
      registerLabel(label, 'Section', num, `sec-${num.replaceAll('.', '-')}`);
    }
  }
}

// --------------------------------------------------------------- emit body

const paragraphs = [];
let abstractHtml = '';
let keywordsHtml = '';
let heroHtml = '';
{
  const abstract = extractEnv(body, 'abstract');
  body = body.slice(0, abstract.start) + body.slice(abstract.end);
  abstractHtml = renderParas(abstract.inner);
  body = body.replace(/\\title\{[^}]*\}|\\subtitle\{[^}]*\}|\\author\{[^}]*\}|\\affiliation\[[^\]]*\]\{[\s\S]*?\}\n|\\authorsaddresses\{\}|\\maketitle/g, '');
  body = body.replace(/\\begin\{CCSXML\}[\s\S]*?\\end\{CCSXML\}/g, '');
  body = body.replace(/\\ccsdesc\[[^\]]*\]\{[^}]*\}/g, '');
  const kw = takeCommand(body, 'keywords');
  if (kw) {
    body = kw.before + kw.after;
    keywordsHtml = inline(kw.content).replaceAll(/[{}]/g, '');
  }
  body = body.replace(/\\begin\{document\}/, '');
  body = body.replace(/\\bibliographystyle\{[^}]*\}/g, '');
  body = body.replace(/\\bibliography\{[^}]*\}/g, '\n\n@@BIBLIOGRAPHY@@\n\n');
}

const eqHtml = (num, b64) =>
  `<div class="equation" id="eq-${num}"><div class="eq-scroll">\\[${escapeHtml(Buffer.from(b64, 'base64').toString())}\\]</div><span class="eq-no">(${num})</span></div>`;

function alignHtml(nums, b64) {
  const texEq = escapeHtml(Buffer.from(b64, 'base64').toString());
  const tagged = texEq
    .split('\\\\')
    .map((row, i) => {
      const n = nums.split(',')[i];
      return n ? `${row} \\tag{${n}}` : row;
    })
    .join('\\\\');
  const firstNum = nums.split(',').find(Boolean);
  return `<div class="equation eq-align" id="eq-${firstNum}"><div class="eq-scroll">\\[\\begin{align}${tagged}\\end{align}\\]</div></div>`;
}

/** One list item; an \item[(P3)]-style tag becomes the visible marker. */
function liHtml(content) {
  const tag = content.match(/^\s*\[([^\]]*)\]/);
  if (tag) {
    const rest = content.slice(tag[0].length).trim();
    return `<li class="tagged"><span class="li-tag">${inline(tag[1])}</span>${renderParas(rest)}</li>`;
  }
  return `<li>${renderParas(content)}</li>`;
}

/** Paragraph-level rendering for nested content (theorem bodies, proofs,
 *  list items): blank-line paragraphs, with equation placeholders expanded. */
function renderParas(content, lead = '') {
  const blocks = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      let m;
      if ((m = p.match(/^@@EQ\|(\d+)\|([A-Za-z0-9+/=]+)@@$/))) return eqHtml(m[1], m[2]);
      if ((m = p.match(/^@@ALIGN\|([^|]*)\|([A-Za-z0-9+/=]+)@@$/))) return alignHtml(m[1], m[2]);
      if ((m = p.match(/^@@LIST\|(\w+)@@$/))) return `<${m[1]}>`;
      if ((m = p.match(/^@@ENDLIST\|(\w+)@@$/))) return `</${m[1]}>`;
      if ((m = p.match(/^@@LI\|([A-Za-z0-9+/=]+)@@$/))) return liHtml(Buffer.from(m[1], 'base64').toString());
      return `<p>${inline(p)}</p>`;
    });
  if (lead && blocks.length && blocks[0].startsWith('<p>')) blocks[0] = `<p>${lead} ${blocks[0].slice(3)}`;
  else if (lead) blocks.unshift(`<p>${lead}</p>`);
  return blocks.join('');
}

let emittedAppendix = false;
for (let para of body.split(/\n\s*\n/)) {
  para = para.trim();
  if (!para) continue;

  if (para.startsWith('\\appendix')) {
    inAppendix = true;
    emittedAppendix = false;
    para = para.slice('\\appendix'.length).trim();
    if (!para) continue;
  }

  const emitSection = (cmd, content) => {
    if (cmd === 'section') {
      if (inAppendix) {
        appendixSecN += 1;
        subN = 0;
        const letter = String.fromCharCode(64 + appendixSecN);
        if (!emittedAppendix) {
          paragraphs.push('<h2 class="part">Appendix</h2>');
          emittedAppendix = true;
        }
        paragraphs.push(`<h2 id="sec-A${appendixSecN}"><span class="secnum">${letter}</span> ${inline(content)}</h2>`);
      } else {
        secN += 1;
        subN = 0;
        paragraphs.push(`<h2 id="sec-${secN}"><span class="secnum">${secN}</span> ${inline(content)}</h2>`);
      }
    } else {
      subN += 1;
      const num = inAppendix ? `${String.fromCharCode(64 + appendixSecN)}.${subN}` : `${secN}.${subN}`;
      paragraphs.push(`<h3 id="sec-${num.replaceAll('.', '-')}"><span class="secnum">${num}</span> ${inline(content)}</h3>`);
    }
  };

  // A paragraph can start with a sectioning command and continue with text.
  let m;
  while ((m = para.match(/^\\(section|subsection)\{/))) {
    const grp = balanced(para, para.indexOf('{'));
    emitSection(m[1], grp.content);
    para = para.slice(grp.end).replace(/^\s*\\label\{[^}]+\}/, '').trim();
  }
  if (!para) continue;

  if (para.startsWith('@@FLOAT')) {
    const idx = Number(para.match(/@@FLOAT(\d+)@@/)[1]);
    if (floats[idx].env === 'teaserfigure') heroHtml = renderFloat(floats[idx]);
    else paragraphs.push(renderFloat(floats[idx]));
    continue;
  }
  if (para === '@@BIBLIOGRAPHY@@') {
    paragraphs.push(
      `<h2 class="part" id="references">References</h2><ol class="references">${used
        .map((e, i) => `<li id="ref-${i + 1}">${formatEntry(e)}</li>`)
        .join('\n')}</ol>`
    );
    continue;
  }
  if (para.startsWith('@@EQ|')) {
    const [, num, b64] = para.match(/@@EQ\|(\d+)\|([^@]+)@@/);
    paragraphs.push(eqHtml(num, b64));
    continue;
  }
  if (para.startsWith('@@ALIGN|')) {
    const [, nums, b64] = para.match(/@@ALIGN\|([^|]*)\|([^@]+)@@/);
    paragraphs.push(alignHtml(nums, b64));
    continue;
  }
  if (para.startsWith('@@THM|')) {
    const [, num, kind, kindClass, titleB64, b64] = para.match(/@@THM\|(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^@]+)@@/);
    const title = titleB64 ? ` (${inline(Buffer.from(titleB64, 'base64').toString())})` : '';
    const content = Buffer.from(b64, 'base64').toString();
    const lead = `<span class="thm-head">${kind} ${num}${title}.</span>`;
    paragraphs.push(`<div class="theorem ${kindClass}" id="thm-${num}">${renderParas(content, lead)}</div>`);
    continue;
  }
  if (para.startsWith('@@PROOF|')) {
    const [, titleB64, b64] = para.match(/@@PROOF\|([^|]*)\|([^@]+)@@/);
    const title = titleB64 ? inline(Buffer.from(titleB64, 'base64').toString()) : 'Proof';
    const content = Buffer.from(b64, 'base64').toString();
    let html = renderParas(content, `<em class="proof-head">${title}.</em>`);
    if (html.endsWith('</p>')) html = `${html.slice(0, -4)} <span class="qed">∎</span></p>`;
    else html += `<p class="qed-line"><span class="qed">∎</span></p>`;
    paragraphs.push(`<div class="proof">${html}</div>`);
    continue;
  }
  if (para.startsWith('@@QUOTE|')) {
    const content = Buffer.from(para.match(/@@QUOTE\|([A-Za-z0-9+/=]+)@@/)[1], 'base64').toString();
    paragraphs.push(`<blockquote class="thesis">${renderParas(content)}</blockquote>`);
    continue;
  }
  if (para.startsWith('@@LIST|')) {
    paragraphs.push(`<${para.includes('ol') ? 'ol' : 'ul'}>`);
    continue;
  }
  if (para.startsWith('@@ENDLIST|')) {
    paragraphs.push(`</${para.includes('ol') ? 'ol' : 'ul'}>`);
    continue;
  }
  if (para.startsWith('@@LI|')) {
    const content = Buffer.from(para.match(/@@LI\|([A-Za-z0-9+/=]+)@@/)[1], 'base64').toString();
    paragraphs.push(liHtml(content));
    continue;
  }
  if (para.startsWith('@@RAW|')) {
    paragraphs.push(Buffer.from(para.match(/@@RAW\|([^@]+)@@/)[1], 'base64').toString());
    continue;
  }

  // \paragraph{...} lead-ins.
  if (para.startsWith('\\paragraph{')) {
    const grp = balanced(para, para.indexOf('{'));
    const rest = para.slice(grp.end).trim();
    paragraphs.push(`<p><span class="paralead">${inline(grp.content)}</span> ${inline(rest)}</p>`);
    continue;
  }

  paragraphs.push(`<p>${inline(para)}</p>`);
}

// --------------------------------------------------------------- assemble

const toc = [];
for (const p of paragraphs) {
  const h = p.match(/^<h2 id="(sec-[^"]+)"><span class="secnum">([^<]+)<\/span> (.*?)<\/h2>$/);
  if (h) toc.push(`<a href="#${h[1]}"><span>${h[2]}</span>${h[3].replace(/<[^>]+>/g, '')}</a>`);
  else if (p.startsWith('<h2 class="part" id="references">'))
    toc.push('<a href="#references"><span>&rarr;</span>References</a>');
}

const katexMacros = JSON.stringify(MATH_MACROS);

const MARK = `<svg class="mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="0.7"><circle cx="10.6" cy="12" r="2.2"/><circle cx="10.6" cy="12" r="4.9"/><circle cx="10.6" cy="12" r="7.6"/><circle cx="10.6" cy="12" r="10.3"/><circle cx="13.4" cy="12" r="2.2"/><circle cx="13.4" cy="12" r="4.9"/><circle cx="13.4" cy="12" r="7.6"/><circle cx="13.4" cy="12" r="10.3"/></g></svg>`;

const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="%231A1D21" stroke-width="0.9"><circle cx="10.6" cy="12" r="2.2"/><circle cx="10.6" cy="12" r="4.9"/><circle cx="10.6" cy="12" r="7.6"/><circle cx="10.6" cy="12" r="10.3"/><circle cx="13.4" cy="12" r="2.2"/><circle cx="13.4" cy="12" r="4.9"/><circle cx="13.4" cy="12" r="7.6"/><circle cx="13.4" cy="12" r="10.3"/></g></svg>').replaceAll('%25', '%')}`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moiré Fields</title>
<meta name="description" content="Moiré as a scalar field: two dense families of curves, and a third pattern that belongs to neither. A representation, a theory of fringes, and a browser studio for drawing with interference.">
<meta property="og:title" content="Moiré Fields">
<meta property="og:description" content="Interference as a scalar field, and a tool for drawing with it.">
<meta property="og:image" content="figures/teaser-row1.png">
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=Inconsolata:wght@400;500;600&display=swap">
<style>
/* The page is the paper: warm ground, dark ink, the pink and blue the figures
   themselves use. A deliberately light, print-committed design. */
:root {
  --paper: #F7F6F2;
  --plate: #FFFFFF;
  --ink: #1A1D21;
  --ink-soft: #494F57;
  --faint: #8A9097;
  --accent: #B41C52;
  --cool: #1B6CA8;
  --hairline: #E4E1D8;
  --hairline-strong: #C9C5BA;
  --serif: "Newsreader", "Iowan Old Style", Georgia, serif;
  --mono: "Inconsolata", "SF Mono", ui-monospace, monospace;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 4.5rem; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font-family: var(--serif); font-size: 1.075rem; line-height: 1.6;
  font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
::selection { background: #F3CBD9; color: var(--ink); }

/* ---- top bar ---- */
.topbar {
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.55rem 1.3rem;
  background: color-mix(in srgb, var(--paper) 86%, transparent);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--hairline);
}
.topbar .wordmark {
  display: flex; align-items: center; gap: 0.55rem;
  font-family: var(--mono); font-size: 0.78rem; font-weight: 600;
  letter-spacing: 0.22em; color: var(--ink); text-decoration: none;
}
.topbar .wordmark .mark { color: var(--accent); }
.topbar .studio {
  font-family: var(--mono); font-size: 0.78rem; font-weight: 500;
  letter-spacing: 0.08em; color: var(--ink-soft); text-decoration: none;
  padding: 0.3rem 0.75rem; border: 1px solid var(--hairline-strong); border-radius: 999px;
  transition: color 120ms, border-color 120ms;
}
.topbar .studio:hover { color: var(--accent); border-color: var(--accent); }

/* ---- layout grid: text column with full-width breakouts ---- */
article {
  display: grid;
  grid-template-columns:
    [full-start] minmax(1.3rem, 1fr)
    [text-start] min(43rem, calc(100% - 2.6rem)) [text-end]
    minmax(1.3rem, 1fr) [full-end];
  padding-bottom: 2rem;
}
article > * { grid-column: text; min-width: 0; }
article > .wide {
  grid-column: full; justify-self: center;
  width: min(76rem, calc(100% - 2.6rem));
}

/* ---- masthead ---- */
.masthead { text-align: center; padding: 4.2rem 0 1.4rem; }
.masthead h1 {
  margin: 0; font-size: clamp(2.9rem, 8vw, 4.4rem); font-weight: 500;
  letter-spacing: -0.015em; line-height: 1.04; text-wrap: balance;
}
.masthead .subtitle {
  margin: 0.9rem 0 0; font-style: italic; font-size: clamp(1.15rem, 3vw, 1.4rem);
  color: var(--ink-soft); text-wrap: balance;
}
.masthead .byline {
  margin: 1.5rem 0 0; font-family: var(--mono); font-size: 0.78rem; font-weight: 500;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--faint);
}
.masthead .byline b { color: var(--ink-soft); font-weight: 600; }

/* ---- hero (the teaser) ---- */
.hero { margin-top: 1.6rem; }

/* ---- abstract ---- */
.abstract {
  margin: 2.6rem 0 0; padding: 1.5rem 0 1.35rem;
  border-top: 1px solid var(--hairline-strong); border-bottom: 1px solid var(--hairline);
}
.abstract .label {
  display: block; font-family: var(--mono); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.24em; text-transform: uppercase; color: var(--accent);
  margin-bottom: 0.7rem;
}
.abstract p { margin: 0.6rem 0 0; font-size: 1.0rem; line-height: 1.66; color: var(--ink-soft); }
.abstract p:first-of-type { margin-top: 0; }
.keywords {
  margin: 1rem 0 0; font-family: var(--mono); font-size: 0.76rem;
  letter-spacing: 0.04em; color: var(--faint);
}

/* ---- table of contents ---- */
.toc {
  margin: 2.8rem 0 1.6rem; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.3rem 2.2rem;
}
.toc a {
  display: flex; gap: 0.8rem; align-items: baseline;
  color: var(--ink-soft); text-decoration: none; font-size: 0.98rem;
  padding: 0.12rem 0; border-bottom: 1px solid transparent;
}
.toc a:hover { color: var(--accent); }
.toc a span {
  font-family: var(--mono); font-size: 0.78rem; font-weight: 600;
  color: var(--faint); min-width: 1.15rem; text-align: right; flex: none;
}
.toc a:hover span { color: var(--accent); }

/* ---- headings ---- */
h2, h3 { font-weight: 600; line-height: 1.22; text-wrap: balance; position: relative; }
h2 { font-size: 1.62rem; margin: 3.4rem 0 0.8rem; }
h3 { font-size: 1.22rem; margin: 2.3rem 0 0.55rem; }
h2.part {
  margin-top: 4.5rem; padding-top: 2.4rem; border-top: 1px solid var(--hairline-strong);
  font-size: 1.3rem; letter-spacing: 0.02em;
}
.secnum {
  color: var(--accent); font-family: var(--mono); font-size: 0.82em;
  font-weight: 600; margin-right: 0.55rem;
}
.anchor {
  position: absolute; left: -1.5rem; top: 0.1em; font-family: var(--mono);
  font-size: 0.8em; color: var(--hairline-strong); text-decoration: none;
  opacity: 0; transition: opacity 120ms;
}
h2:hover .anchor, h3:hover .anchor { opacity: 1; }
.anchor:hover { color: var(--accent); }

/* ---- running text ---- */
p { margin: 0.9rem 0; }
a { color: var(--cool); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 2px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
code { font-family: var(--mono); font-size: 0.9em; }
.sc { font-variant: small-caps; letter-spacing: 0.03em; }
.nowrap { white-space: nowrap; }
.paralead { font-style: italic; font-weight: 600; }
ul, ol { padding-left: 1.5rem; margin: 0.9rem 0; }
li { margin: 0.35rem 0; }
li p { margin: 0.35rem 0; }
li.tagged { list-style: none; position: relative; }
li.tagged .li-tag {
  position: absolute; left: -1.5rem; transform: translateX(-100%);
  font-family: var(--mono); font-size: 0.82rem; font-weight: 600; color: var(--accent);
  white-space: nowrap; top: 0.22em;
}
@media (max-width: 56rem) {
  li.tagged .li-tag { position: static; transform: none; margin-right: 0.5rem; }
}
.cite a { color: var(--faint); font-size: 0.92em; }
.cite a:hover { color: var(--accent); text-decoration: none; }

/* ---- thesis pull-quote ---- */
blockquote.thesis {
  margin: 2rem auto; max-width: 32rem; text-align: center;
  font-style: italic; font-size: 1.22rem; line-height: 1.5; color: var(--ink);
}
blockquote.thesis::before {
  content: ""; display: block; width: 3.2rem; height: 1px;
  background: var(--accent); margin: 0 auto 1.15rem;
}
blockquote.thesis::after {
  content: ""; display: block; width: 3.2rem; height: 1px;
  background: var(--accent); margin: 1.15rem auto 0;
}
blockquote.thesis p { margin: 0; }

/* ---- slim scrollbars on internal scroll regions ---- */
.eq-scroll, .table-scroll { scrollbar-width: thin; scrollbar-color: var(--hairline-strong) transparent; }
.eq-scroll::-webkit-scrollbar, .table-scroll::-webkit-scrollbar { height: 4px; }
.eq-scroll::-webkit-scrollbar-thumb, .table-scroll::-webkit-scrollbar-thumb { background: var(--hairline-strong); border-radius: 2px; }
.eq-scroll::-webkit-scrollbar-track, .table-scroll::-webkit-scrollbar-track { background: transparent; }

/* ---- display math: the number lives outside the scrollable math box ---- */
.equation { display: flex; align-items: center; gap: 0.7rem; margin: 0.4rem 0; }
.eq-scroll { flex: 1 1 auto; min-width: 0; overflow-x: auto; overflow-y: hidden; padding: 0.2rem 0.1rem; }
.equation > .eq-scroll:only-child, .equation:not(:has(.eq-no)) { display: block; }
.eq-no { flex: none; color: var(--faint); font-size: 0.95rem; }
.equation:not(:has(.eq-scroll)) { display: block; overflow-x: auto; overflow-y: hidden; padding: 0.25rem 0.1rem; }
.katex { font-size: 1.05em; }
.katex-display { margin: 0.55em 0; }
.katex-display .tag { color: var(--faint); }
.eq-scroll .katex-display { width: max-content; min-width: 100%; }
.eq-align .katex-display { padding-right: 3rem; box-sizing: border-box; }
@media (max-width: 480px) { .katex-display .katex { font-size: 0.98em; } }

/* ---- theorems & proofs ---- */
.theorem {
  border-left: 2px solid var(--accent); padding: 0.15rem 0 0.15rem 1.15rem;
  margin: 1.4rem 0; font-style: italic; color: var(--ink-soft);
}
.theorem.thm-def { font-style: normal; border-left-color: var(--cool); }
.thm-head { font-style: normal; font-weight: 600; color: var(--ink); }
.theorem .katex { font-style: normal; }
.proof { color: var(--ink-soft); margin: 1rem 0 1.5rem; }
.proof-head { font-weight: 500; }
.qed { float: right; color: var(--faint); }
.qed-line { text-align: right; margin: 0.2rem 0 0; }

/* ---- figures ---- */
figure.paper-figure, figure.algorithm { margin: 2.2rem 0; }
figure.paper-table { margin: 2.2rem 0; }
/* Figures sit directly on the paper: raster art multiplies its white away,
   and tikz plots are rasterized with true transparency. */
figure img {
  max-width: 100%; height: auto; display: block; margin: 0 auto;
  mix-blend-mode: multiply;
}
figure img.tikz { max-width: 100%; }
figcaption {
  font-size: 0.87rem; color: var(--ink-soft); line-height: 1.5;
  padding-top: 0.65rem; max-width: 43rem; margin: 0 auto;
}
.fignum {
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent);
  margin-right: 0.35rem;
}
.subrow { display: flex; gap: 8px; align-items: flex-start; }
.subrow figure.sub { margin: 0; flex: 1 1 0; min-width: 0; }
.subrow figcaption { text-align: center; font-size: 0.78rem; color: var(--faint); padding-top: 0.45rem; }
.panelrow {
  display: flex; font-size: 0.78rem; color: var(--faint);
  font-family: var(--mono); padding: 0.35rem 0 0.9rem;
}
.panelrow span { flex: 1; text-align: center; }
@media (max-width: 640px) {
  .subrow { flex-wrap: wrap; }
  .subrow figure.sub { flex-basis: 46%; }
  .panelrow { font-size: 0.62rem; }
}

/* ---- tables ---- */
.table-scroll { overflow-x: auto; }
table {
  border-collapse: collapse; font-size: 0.9rem; margin: 0 auto;
  font-variant-numeric: tabular-nums; line-height: 1.4;
}
th, td { padding: 0.32rem 0.75rem; text-align: left; vertical-align: top; }
th { border-bottom: 1px solid var(--ink); font-weight: 600; }
thead th, tr:first-child th { border-top: 1px solid var(--ink); }
tr.rule-above td { border-top: 1px solid var(--hairline-strong); }
table tr:last-child td { border-bottom: 1px solid var(--ink); }
table .center { text-align: center; }
figure.paper-table figcaption { padding: 0 0 0.6rem; }

/* ---- algorithm ---- */
.algorithm {
  border: 1px solid var(--hairline-strong); border-radius: 4px;
  padding: 0.9rem 1.15rem 1.05rem; background: var(--plate);
}
.algorithm figcaption { padding: 0 0 0.6rem; border-bottom: 1px solid var(--hairline); margin-bottom: 0.6rem; }
.algorithm-body { font-size: 0.94rem; }
.alg-line { padding: 0.12rem 0; }
.alg-comment { color: var(--faint); font-size: 0.85em; margin-left: 0.6rem; }

/* ---- references ---- */
ol.references { padding-left: 1.9rem; font-size: 0.92rem; color: var(--ink-soft); }
ol.references li { margin: 0.55rem 0; }
ol.references li::marker { font-family: var(--mono); font-size: 0.8rem; color: var(--faint); }
ol.references em { font-style: normal; }
ol.references li.flash { animation: flash 1.6s ease-out; }
@keyframes flash { 0% { background: #F3CBD9; } 100% { background: transparent; } }

/* ---- citation hover card ---- */
#citecard {
  position: absolute; left: 0; top: 0; z-index: 50; max-width: min(24rem, calc(100vw - 2rem));
  background: var(--plate); border: 1px solid var(--hairline-strong);
  border-radius: 4px; box-shadow: 0 6px 24px rgba(26, 29, 33, 0.09);
  padding: 0.65rem 0.85rem; font-size: 0.85rem; line-height: 1.5; color: var(--ink-soft);
  pointer-events: none; opacity: 0; transition: opacity 100ms;
}
#citecard.show { opacity: 1; }
#citecard em { font-style: normal; font-weight: 600; color: var(--ink); }

/* ---- footer ---- */
footer {
  border-top: 1px solid var(--hairline-strong); margin-top: 3rem;
  padding: 1.8rem 1.3rem 2.6rem; text-align: center;
}
footer .mark { color: var(--accent); display: block; margin: 0 auto 0.8rem; }
footer p { margin: 0.25rem 0; font-size: 0.88rem; color: var(--faint); }
footer a { color: var(--ink-soft); }
footer a:hover { color: var(--accent); text-decoration: none; }
</style>
</head>
<body>
<nav class="topbar">
  <a class="wordmark" href="#top">${MARK}MOIRÉ FIELDS</a>
  <a class="studio" href="../" title="Open the interactive studio this paper describes">Open the studio ↗</a>
</nav>
<article id="top">
  <header class="masthead">
    <h1>Moiré Fields</h1>
    <p class="subtitle">Interference as a scalar field, and a tool for drawing with it</p>
    <p class="byline"><b>Neo Mohsenvand</b> · 2026</p>
  </header>
  <div class="hero wide">${heroHtml.replace('<figure class="paper-figure wide"', '<figure class="paper-figure"')}</div>
  <div class="abstract">
    <span class="label">Abstract</span>
    ${abstractHtml}
    <p class="keywords">${keywordsHtml}</p>
  </div>
  <nav class="toc">${toc.join('\n')}</nav>
${paragraphs.join('\n')}
</article>
<footer>
  ${MARK.replace('width="20" height="20"', 'width="26" height="26"')}
  <p>Moiré Fields · Neo Mohsenvand · 2026</p>
  <p><a href="../">Open the studio</a> — the browser tool this paper describes.</p>
  <p>This page is generated from the paper&rsquo;s LaTeX source by its own build pipeline.</p>
</footer>
<script>
document.addEventListener('DOMContentLoaded', () => {
  // Math.
  const render = () => renderMathInElement(document.body, {
    delimiters: [
      { left: '\\\\[', right: '\\\\]', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\\\(', right: '\\\\)', display: false },
    ],
    macros: ${katexMacros},
    trust: true,
    strict: false,
    output: 'html',
  });
  if (window.renderMathInElement) render();
  else window.addEventListener('load', render);

  // Heading anchors.
  document.querySelectorAll('h2[id], h3[id]').forEach((h) => {
    const a = document.createElement('a');
    a.className = 'anchor';
    a.href = '#' + h.id;
    a.textContent = '#';
    a.setAttribute('aria-label', 'Link to this section');
    h.appendChild(a);
  });

  // Citation hover cards, and a flash when a citation is followed.
  const card = document.createElement('div');
  card.id = 'citecard';
  document.body.appendChild(card);
  let hideTimer = null;
  document.querySelectorAll('.cite a, a[href^="#ref-"]').forEach((a) => {
    a.addEventListener('mouseenter', () => {
      const li = document.querySelector(a.getAttribute('href'));
      if (!li) return;
      clearTimeout(hideTimer);
      card.innerHTML = li.innerHTML;
      const r = a.getBoundingClientRect();
      card.style.left = Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - card.offsetWidth - 400) + 'px';
      card.style.top = window.scrollY + r.bottom + 8 + 'px';
      card.classList.add('show');
      const rect = card.getBoundingClientRect();
      if (rect.right > window.innerWidth - 12) {
        card.style.left = window.scrollX + window.innerWidth - rect.width - 12 + 'px';
      }
    });
    a.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(() => card.classList.remove('show'), 120);
    });
    a.addEventListener('click', () => {
      const li = document.querySelector(a.getAttribute('href'));
      if (li && li.matches('ol.references li')) {
        li.classList.remove('flash');
        requestAnimationFrame(() => li.classList.add('flash'));
      }
    });
  });
});
</script>
</body>
</html>
`;

const stamped = html.replace(/<img ([^>]*?)src="(figures\/[^"]+)"/g, (m, pre, src) => {
  const d = IMG_DIMS.get(src);
  return d ? `<img ${pre}src="${src}" width="${d.w}" height="${d.h}"` : m;
});
writeFileSync(join(OUT, 'index.html'), stamped);
console.log(
  `wrote public/paper/index.html  (${paragraphs.length} blocks, ${figN} figures, ${tabN} tables, ${eqN} equations, ${thmN} theorem-like, ${used.length} references, ${tikzCount} tikz)`
);
