// Assembles the teaser-candidate picker page from gallery.json: a numbered
// grid, one card per candidate, pattern above and envelope below in each image.
//
//   node paper/tools/exp/teaser-gallery.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const DIR = new URL('../../figures/teaser-candidates/', import.meta.url);
const cards = JSON.parse(readFileSync(new URL('gallery.json', DIR).pathname, 'utf8'));

const cardHtml = (c) => `
  <figure>
    <div class="num">${c.id}</div>
    <img src="data:image/png;base64,${c.b64}" alt="Candidate ${c.id}: ${c.name}">
    <figcaption><strong>${c.name}</strong><span>${c.note}</span></figcaption>
  </figure>`;

const html = `<title>Teaser Candidates</title>
<style>
  :root { --ground: #f7f7f5; --ink: #15181c; --soft: #8a94a0; --hairline: #d8dad6; --accent: #c81e5a; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --ground: #101317; --ink: #e6e8eb; --soft: #6b7580; --hairline: #2a2f36; --accent: #e8558a; }
  }
  :root[data-theme="dark"] { --ground: #101317; --ink: #e6e8eb; --soft: #6b7580; --hairline: #2a2f36; --accent: #e8558a; }
  body { background: var(--ground); color: var(--ink); font-family: Georgia, serif; margin: 0; padding: 2rem 1.2rem 4rem; }
  header { max-width: 72rem; margin: 0 auto 1.6rem; }
  h1 { font-size: 1.7rem; font-weight: 500; margin: 0 0 0.3rem; }
  p.lede { color: var(--soft); font-style: italic; margin: 0; max-width: 46rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.2rem; max-width: 72rem; margin: 0 auto; }
  figure { margin: 0; position: relative; }
  img { width: 100%; display: block; border: 1px solid var(--hairline); border-radius: 4px; background: #fff; }
  .num { position: absolute; top: 0.5rem; left: 0.5rem; z-index: 1; background: var(--ink); color: var(--ground);
         font-family: ui-monospace, monospace; font-size: 0.8rem; font-weight: 600; line-height: 1;
         padding: 0.3rem 0.45rem; border-radius: 3px; }
  figcaption { display: flex; gap: 0.5rem; align-items: baseline; padding: 0.4rem 0.1rem 0; font-size: 0.85rem; }
  figcaption strong { font-weight: 600; }
  figcaption span { color: var(--soft); font-size: 0.78rem; }
</style>
<header>
  <h1>Teaser candidates</h1>
  <p class="lede">Sixteen scenes, each split at the waist: the pattern above, its envelope below
  &mdash; the carrier dissolving into its own fringe field. Reply with the four numbers you want
  on the banner (and any retuning notes: ink, pitch, framing).</p>
</header>
<div class="grid">${cards.map(cardHtml).join('\n')}</div>
`;

writeFileSync(new URL('gallery.html', DIR).pathname, html);
console.log(`wrote gallery.html (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
