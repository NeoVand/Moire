// Local sink for browser-side results. The GPU experiments run in a page, and a
// page cannot write to the repository, so they POST here instead.
//
//   node paper/tools/sink.mjs        # then run the probe from the page

import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { DATA, FIGURES } from './lib/instrument.mjs';

const PORT = 5199;

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405).end('post only');
    return;
  }
  const name = basename(req.url.replace(/^\//, '')) || 'out.json';
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const dir = /\.(png|jpg)$/.test(name) ? FIGURES : DATA;
    const isBase64 = /\.(png|jpg)$/.test(name);
    const out = join(dir, name);
    writeFileSync(out, isBase64 ? Buffer.from(body.toString(), 'base64') : body);
    console.log(`${out}  ${(body.length / 1024).toFixed(1)} kB`);
    res.writeHead(200).end(out);
  });
}).listen(PORT, () => console.log(`sink on http://localhost:${PORT} -> paper/data, paper/figures`));
